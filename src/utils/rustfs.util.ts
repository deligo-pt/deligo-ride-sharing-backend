import { randomUUID } from 'crypto';
import path from 'path';
import {
  CreateBucketCommand,
  DeleteObjectCommand,
  HeadBucketCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { config } from '../config';

const { endpoint, region, accessKey, secretKey, bucket, publicUrl, allowedUrlHosts } =
  config.rustfs;

export const rustfsClient = new S3Client({
  endpoint,
  region,
  credentials: { accessKeyId: accessKey, secretAccessKey: secretKey },
  forcePathStyle: true,
});

export interface UploadableFile {
  buffer: Buffer;
  originalname: string;
  mimetype: string;
}

export interface RustFSUploadResult {
  key: string;
  url: string;
}

const trimSlashes = (value: string): string => value.replace(/\/+$/, '');

const publicBaseUrl = (): string => trimSlashes(publicUrl ?? `${trimSlashes(endpoint)}/${bucket}`);

const buildPublicUrl = (key: string): string => `${publicBaseUrl()}/${key}`;

const extractKey = (fileUrlOrKey: string): string | null => {
  const input = fileUrlOrKey.trim();
  if (!input) return null;

  if (!/^https?:\/\//i.test(input)) return input.replace(/^\/+/, '') || null;

  const prefixes = [`${publicBaseUrl()}/`, `${trimSlashes(endpoint)}/${bucket}/`];
  for (const prefix of prefixes) {
    if (input.startsWith(prefix)) {
      const rest = input.slice(prefix.length).split(/[?#]/)[0];
      return rest ? decodeURIComponent(rest) : null;
    }
  }
  return null;
};

export const isStoredFileUrl = (url: string, folder?: string): boolean => {
  const key = extractKey(url);
  if (key && /^https?:\/\//i.test(url)) {
    const clean =
      !/[?#]/.test(url) && !key.split('/').some((s) => s === '..' || s === '' || s === '.');
    return clean && (!folder || key.startsWith(`${folder}/`));
  }
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'https:' && allowedUrlHosts.includes(parsed.hostname.toLowerCase());
  } catch {
    return false;
  }
};

export const uploadToRustFS = async (
  file: Express.Multer.File | UploadableFile,
  folder: string,
): Promise<RustFSUploadResult> => {
  const ext = path.extname(file.originalname).toLowerCase();
  const key = `${folder.replace(/^\/+|\/+$/g, '')}/${Date.now()}-${randomUUID()}${ext}`;

  await rustfsClient.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: file.buffer,
      ContentType: file.mimetype,
    }),
  );

  return { key, url: buildPublicUrl(key) };
};

export const deleteFromRustFS = async (fileUrlOrKey: string): Promise<void> => {
  try {
    const key = extractKey(fileUrlOrKey);
    if (!key) return;
    await rustfsClient.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
  } catch (err) {
    console.warn(`⚠️  RustFS delete failed for "${fileUrlOrKey}":`, (err as Error).message);
  }
};

export const deleteFromRustFSInBackground = (
  ...urlsOrKeys: Array<string | null | undefined>
): void => {
  for (const item of urlsOrKeys) {
    if (item) void deleteFromRustFS(item);
  }
};

export const ensureRustFSBucketExists = async (): Promise<void> => {
  try {
    await rustfsClient.send(new HeadBucketCommand({ Bucket: bucket }));
    console.info(`✅ RustFS bucket "${bucket}" is ready`);
    return;
  } catch (err) {
    const status = (err as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode;
    const name = (err as Error).name;
    if (status !== 404 && name !== 'NotFound' && name !== 'NoSuchBucket') {
      console.error(`❌ RustFS unreachable at ${endpoint}:`, (err as Error).message);
      return;
    }
  }

  try {
    await rustfsClient.send(new CreateBucketCommand({ Bucket: bucket }));
    console.info(`✅ RustFS bucket "${bucket}" created`);
  } catch (err) {
    console.error(`❌ Failed to create RustFS bucket "${bucket}":`, (err as Error).message);
  }
};
