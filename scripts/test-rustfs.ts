import './helpers/rustfs-test-env';
import assert from 'assert';
import http from 'http';
import express from 'express';
import {
  CreateBucketCommand,
  DeleteObjectCommand,
  HeadBucketCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import {
  deleteFromRustFS,
  ensureRustFSBucketExists,
  uploadToRustFS,
} from '../src/utils/rustfs.util';
import { REQUIRED_KYC_DOCUMENTS } from '../src/modules/kyc/kyc.constant';
import { KycValidation } from '../src/modules/kyc/kyc.validation';
import { VehicleValidation } from '../src/modules/vehicle/vehicle.validation';
import { uploadRouter } from '../src/modules/upload/upload.route';
import { MAX_MULTIPLE_FILES } from '../src/modules/upload/upload.constant';
import type { UploadFileResult } from '../src/modules/upload/upload.interface';
import { errorHandler } from '../src/middlewares/errorHandler';

type Sent = { name: string; input: Record<string, unknown> };
const sent: Sent[] = [];
let sendImpl: (cmd: { constructor: { name: string }; input: unknown }) => unknown = () => ({});

(S3Client.prototype as unknown as { send: unknown }).send = async function (cmd: {
  constructor: { name: string };
  input: Record<string, unknown>;
}) {
  sent.push({ name: cmd.constructor.name, input: cmd.input });
  return sendImpl(cmd);
};

const BASE = 'http://rustfs.test:9000/deligo-ride-sharing';
let passed = 0;
const test = async (name: string, fn: () => Promise<void>): Promise<void> => {
  sent.length = 0;
  sendImpl = () => ({});
  await fn();
  passed++;
  console.log(`  ✅ ${name}`);
};

async function main(): Promise<void> {
  console.log('🧪 RustFS storage tests\n');

  await test('uploadToRustFS: key, PutObject params and URL', async () => {
    const res = await uploadToRustFS(
      { buffer: Buffer.from('x'), originalname: 'Licence.JPG', mimetype: 'image/jpeg' },
      'kyc-documents',
    );
    assert.match(res.key, /^kyc-documents\/\d+-[0-9a-f-]{36}\.jpg$/);
    assert.strictEqual(res.url, `${BASE}/${res.key}`);
    assert.strictEqual(sent.length, 1);
    assert.strictEqual(sent[0].name, PutObjectCommand.name);
    assert.strictEqual(sent[0].input.Bucket, 'deligo-ride-sharing');
    assert.strictEqual(sent[0].input.Key, res.key);
    assert.strictEqual(sent[0].input.ContentType, 'image/jpeg');
  });

  await test('uploadToRustFS: keys are collision-safe', async () => {
    const f = { buffer: Buffer.from('x'), originalname: 'a.png', mimetype: 'image/png' };
    const [a, b] = await Promise.all([uploadToRustFS(f, 'p'), uploadToRustFS(f, 'p')]);
    assert.notStrictEqual(a.key, b.key);
  });

  await test('uploadToRustFS: propagates storage errors', async () => {
    sendImpl = () => {
      throw new Error('boom');
    };
    await assert.rejects(
      uploadToRustFS(
        { buffer: Buffer.from('x'), originalname: 'a.pdf', mimetype: 'application/pdf' },
        'f',
      ),
      /boom/,
    );
  });

  await test('deleteFromRustFS: accepts full URL and bare key', async () => {
    await deleteFromRustFS(`${BASE}/kyc-documents/1-abc.jpg`);
    await deleteFromRustFS('vehicle-photos/2-def.png');
    assert.deepStrictEqual(
      sent.map((s) => [s.name, s.input.Key]),
      [
        [DeleteObjectCommand.name, 'kyc-documents/1-abc.jpg'],
        [DeleteObjectCommand.name, 'vehicle-photos/2-def.png'],
      ],
    );
  });

  await test('deleteFromRustFS: ignores foreign/legacy URLs and empty input', async () => {
    await deleteFromRustFS('https://res.cloudinary.com/x/image/upload/kyc-documents/old.jpg');
    await deleteFromRustFS('');
    assert.strictEqual(sent.length, 0);
  });

  await test('deleteFromRustFS: never throws when storage fails', async () => {
    sendImpl = () => {
      throw new Error('NoSuchKey');
    };
    const warn = console.warn;
    console.warn = () => undefined;
    try {
      await deleteFromRustFS('a/b.jpg');
    } finally {
      console.warn = warn;
    }
  });

  await test('ensureRustFSBucketExists: existing bucket → no create', async () => {
    await ensureRustFSBucketExists();
    assert.deepStrictEqual(
      sent.map((s) => s.name),
      [HeadBucketCommand.name],
    );
  });

  await test('ensureRustFSBucketExists: missing bucket → creates it', async () => {
    sendImpl = (cmd) => {
      if (cmd.constructor.name === HeadBucketCommand.name) {
        throw Object.assign(new Error('nf'), {
          name: 'NotFound',
          $metadata: { httpStatusCode: 404 },
        });
      }
      return {};
    };
    await ensureRustFSBucketExists();
    assert.deepStrictEqual(
      sent.map((s) => s.name),
      [HeadBucketCommand.name, CreateBucketCommand.name],
    );
  });

  await test('ensureRustFSBucketExists: unreachable → logs, does not throw or create', async () => {
    sendImpl = () => {
      throw Object.assign(new Error('ECONNREFUSED'), { name: 'Error' });
    };
    const err = console.error;
    console.error = () => undefined;
    try {
      await ensureRustFSBucketExists();
    } finally {
      console.error = err;
    }
    assert.deepStrictEqual(
      sent.map((s) => s.name),
      [HeadBucketCommand.name],
    );
  });

  const app = express();
  app.use(express.json());
  app.use('/api/v1/upload', uploadRouter);
  app.use(errorHandler);

  const server = http.createServer(app);
  await new Promise<void>((r) => server.listen(0, r));
  const port = (server.address() as { port: number }).port;
  const AUTH = { Authorization: 'Bearer test' };
  const post = (path: string, form: FormData, headers: Record<string, string> = AUTH) =>
    fetch(`http://127.0.0.1:${port}/api/v1/upload${path}`, {
      method: 'POST',
      body: form,
      headers,
    });
  const file = (type: string) => new Blob(['data'], { type });
  const puts = () => sent.filter((s) => s.name === PutObjectCommand.name);

  try {
    await test('POST /upload: stores one file, defaults folder to "general"', async () => {
      const form = new FormData();
      form.append('file', file('image/png'), 'selfie.png');
      const res = await post('', form);
      assert.strictEqual(res.status, 201, await res.clone().text());
      const { data } = (await res.json()) as { data: UploadFileResult };
      assert.match(data.key, /^general\/\d+-[0-9a-f-]{36}\.png$/);
      assert.strictEqual(data.url, `${BASE}/${data.key}`);
      assert.strictEqual(data.originalName, 'selfie.png');
      assert.strictEqual(data.mimetype, 'image/png');
      assert.strictEqual(data.size, 4);
      assert.strictEqual(puts().length, 1);
    });

    await test('POST /upload: folder from body and from query', async () => {
      let form = new FormData();
      form.append('file', file('application/pdf'), 'a.pdf');
      form.append('folder', 'kyc-documents');
      let res = await post('', form);
      assert.strictEqual(res.status, 201);
      assert.ok(
        ((await res.json()) as { data: UploadFileResult }).data.key.startsWith('kyc-documents/'),
      );

      form = new FormData();
      form.append('file', file('image/jpeg'), 'a.jpg');
      res = await post('?folder=vehicle-photos', form);
      assert.strictEqual(res.status, 201);
      assert.ok(
        ((await res.json()) as { data: UploadFileResult }).data.key.startsWith('vehicle-photos/'),
      );
    });

    await test('POST /upload: rejects bad folder, missing file, bad MIME, no auth', async () => {
      let form = new FormData();
      form.append('file', file('image/png'), 'a.png');
      form.append('folder', '../etc');
      assert.strictEqual((await post('', form)).status, 422);

      assert.strictEqual((await post('', new FormData())).status, 400);

      form = new FormData();
      form.append('file', file('text/html'), 'x.html');
      assert.strictEqual((await post('', form)).status, 400);

      form = new FormData();
      form.append('file', file('image/png'), 'a.png');
      assert.strictEqual((await post('', form, {})).status, 401);
      assert.strictEqual(sent.length, 0);
    });

    await test('POST /upload/multiple: uploads several files in parallel', async () => {
      const form = new FormData();
      form.append('folder', 'vehicle-photos');
      for (let i = 0; i < 3; i++) form.append('files', file('image/webp'), `${i}.webp`);
      const res = await post('/multiple', form);
      assert.strictEqual(res.status, 201, await res.clone().text());
      const { data } = (await res.json()) as { data: UploadFileResult[] };
      assert.strictEqual(data.length, 3);
      assert.ok(data.every((d) => d.url.startsWith(`${BASE}/vehicle-photos/`)));
      assert.strictEqual(puts().length, 3);
    });

    await test('POST /upload/multiple: >10 files and wrong field rejected', async () => {
      let form = new FormData();
      for (let i = 0; i < MAX_MULTIPLE_FILES + 1; i++)
        form.append('files', file('image/png'), `${i}.png`);
      assert.strictEqual((await post('/multiple', form)).status, 400);

      form = new FormData();
      form.append('file', file('image/png'), 'a.png');
      assert.strictEqual((await post('/multiple', form)).status, 400);
      assert.strictEqual(sent.length, 0);
    });

    await test('POST /upload/multiple: rolls back uploaded keys when one upload fails', async () => {
      let n = 0;
      sendImpl = (cmd) => {
        if (cmd.constructor.name === PutObjectCommand.name && ++n === 2)
          throw new Error('disk full');
        return {};
      };
      const form = new FormData();
      for (let i = 0; i < 3; i++) form.append('files', file('image/png'), `${i}.png`);
      const quiet = console.error;
      console.error = () => undefined;
      try {
        assert.strictEqual((await post('/multiple', form)).status, 500);
      } finally {
        console.error = quiet;
      }
      const putKeys = puts().map((s) => s.input.Key);
      const deleted = sent
        .filter((s) => s.name === DeleteObjectCommand.name)
        .map((s) => s.input.Key);
      assert.strictEqual(deleted.length, 2);
      assert.ok(deleted.every((k) => putKeys.includes(k)));
    });

    const kycUrl = (type: string): string => `${BASE}/kyc-documents/1-${type}.pdf`;
    const kycBody = (): { documents: Array<Record<string, string>> } => ({
      documents: REQUIRED_KYC_DOCUMENTS.map((d) => ({
        documentType: d.type,
        documentUrl: kycUrl(d.type),
        ...(d.requiresExpiry ? { expiryDate: '2035-12-31T00:00:00Z' } : {}),
      })),
    });
    const kycSchema = KycValidation.submitDocuments.body;

    await test('KYC JSON: 7 valid RustFS URLs accepted', async () => {
      assert.ok(kycSchema.safeParse(kycBody()).success);
    });

    await test('KYC JSON: missing/duplicate types, bad dates and foreign URLs rejected', async () => {
      const missing = kycBody();
      missing.documents.pop();
      assert.ok(!kycSchema.safeParse(missing).success);

      const dup = kycBody();
      dup.documents[1].documentType = dup.documents[0].documentType;
      assert.ok(!kycSchema.safeParse(dup).success);

      const badDate = kycBody();
      badDate.documents[0].expiryDate = 'tomorrow';
      assert.ok(!kycSchema.safeParse(badDate).success);

      const foreign = kycBody();
      foreign.documents[0].documentUrl = 'https://evil.example.org/x.pdf';
      assert.ok(!kycSchema.safeParse(foreign).success);

      const wrongFolder = kycBody();
      wrongFolder.documents[0].documentUrl = `${BASE}/vehicle-photos/1-a.jpg`;
      assert.ok(!kycSchema.safeParse(wrongFolder).success);

      const traversal = kycBody();
      traversal.documents[0].documentUrl = `${BASE}/kyc-documents/../avatars/1-a.jpg`;
      assert.ok(!kycSchema.safeParse(traversal).success);

      assert.ok(!kycSchema.safeParse({}).success);
    });

    await test('KYC JSON: https URL on an allow-listed host is accepted', async () => {
      const body = kycBody();
      body.documents[0].documentUrl = 'https://cdn.example.com/licence.pdf';
      assert.ok(kycSchema.safeParse(body).success);
      body.documents[0].documentUrl = 'http://cdn.example.com/licence.pdf';
      assert.ok(!kycSchema.safeParse(body).success);
    });

    await test('Vehicle JSON: { photos } accepts 1-5 RustFS URLs only', async () => {
      const schema = VehicleValidation.addPhotos.body;
      const url = (i: number): string => `${BASE}/vehicle-photos/${i}-a.jpg`;
      assert.ok(schema.safeParse({ photos: [url(1)] }).success);
      assert.ok(schema.safeParse({ photos: [1, 2, 3, 4, 5].map(url) }).success);
      assert.ok(!schema.safeParse({ photos: [] }).success);
      assert.ok(!schema.safeParse({ photos: [1, 2, 3, 4, 5, 6].map(url) }).success);
      assert.ok(!schema.safeParse({ photos: [url(1), url(1)] }).success);
      assert.ok(!schema.safeParse({ photos: ['https://evil.example.org/a.jpg'] }).success);
      assert.ok(!schema.safeParse({ photos: [`${BASE}/kyc-documents/1-a.pdf`] }).success);
      assert.ok(!schema.safeParse({}).success);
    });
  } finally {
    server.close();
  }

  console.log(`\n✅ ${passed} RustFS tests passed`);
}

main().catch((err) => {
  console.error('❌ RustFS tests failed:', err);
  process.exit(1);
});
