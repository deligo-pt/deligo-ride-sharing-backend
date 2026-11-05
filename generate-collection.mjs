import fs from 'fs';
import path from 'path';

// Helper to generate Postman URL object
function createUrl(rawUrl, pathVars = [], queryParams = []) {
  // Replace {{baseUrl}} for path parsing
  const cleanUrl = rawUrl.replace('{{baseUrl}}', '');
  const urlParts = cleanUrl.split('?');
  const pathSegment = urlParts[0].split('/').filter(Boolean);
  
  const query = queryParams.map(q => ({
    key: q.key,
    value: q.value,
    description: q.description || ''
  }));

  const variable = pathVars.map(v => ({
    key: v.key,
    value: v.value,
    description: v.description || ''
  }));

  const urlObj = {
    raw: rawUrl,
    host: ['{{baseUrl}}'],
    path: pathSegment
  };

  if (query.length > 0) {
    urlObj.query = query;
  }
  if (variable.length > 0) {
    urlObj.variable = variable;
  }

  return urlObj;
}

// Standard JSON header
function authHeaders() {
  return [
    {
      key: 'Content-Type',
      value: 'application/json',
      type: 'text'
    },
    {
      key: 'x-mock-user-id',
      value: '{{mockUserId}}',
      type: 'text'
    },
    {
      key: 'x-mock-role',
      value: '{{mockRole}}',
      type: 'text'
    }
  ];
}

function multipartAuthHeaders() {
  return [
    {
      key: 'x-mock-user-id',
      value: '{{mockUserId}}',
      type: 'text'
    },
    {
      key: 'x-mock-role',
      value: '{{mockRole}}',
      type: 'text'
    }
  ];
}

function createPreRequestScript(role, userIdVar = null) {
  const lines = [
    `// Auto-set mock headers for role-specific endpoint`,
    `pm.variables.set("mockRole", "${role}");`
  ];
  if (userIdVar) {
    lines.push(`pm.variables.set("mockUserId", pm.collectionVariables.get("${userIdVar}") || pm.variables.get("mockUserId"));`);
  }
  return {
    listen: 'prerequest',
    script: {
      type: 'text/javascript',
      exec: lines
    }
  };
}

function createTestScript(tests = [], captureFn = null) {
  const lines = [];
  if (tests.length > 0) {
    tests.forEach(t => lines.push(t));
  } else {
    lines.push(
      'pm.test("Status code is 200 or 201", function () {',
      '    pm.expect(pm.response.code).to.be.oneOf([200, 201]);',
      '});'
    );
  }

  if (captureFn) {
    lines.push(...captureFn);
  }

  return {
    listen: 'test',
    script: {
      type: 'text/javascript',
      exec: lines
    }
  };
}

// Build the complete collection
const collection = {
  info: {
    _postman_id: 'e1d2c3b4-5678-490a-bcde-deligo000001',
    name: 'DeliGo Ride-Sharing API',
    description: 'Complete, production-grade Postman collection for DeliGo Ride-Sharing platform backend.\n\n### Authentication\nAuthentication is simulated via Mock Headers:\n- `x-mock-user-id`: Customer, Driver, or Admin UUID\n- `x-mock-role`: `CUSTOMER`, `DRIVER`, or `ADMIN`\n\n### Automatic Variable Extraction\nAll creation endpoints automatically capture IDs (such as `activeRideId`, `activeTicketId`, `activePromoId`, `activeVehicleId`, `activeAlertId`) and populate Collection Variables for chained testing workflows.',
    schema: 'https://schema.getpostman.com/json/collection/v2.1.0/collection.json'
  },
  variable: [
    {
      key: 'baseUrl',
      value: 'http://localhost:3000/api/v1',
      type: 'string',
      description: 'API base URL'
    },
    {
      key: 'mockUserId',
      value: 'f47ac10b-58cc-4372-a567-0e02b2c3d479',
      type: 'string',
      description: 'Default mock user ID (Customer Jane Doe)'
    },
    {
      key: 'mockRole',
      value: 'CUSTOMER',
      type: 'string',
      description: 'Default mock role (CUSTOMER | DRIVER | ADMIN)'
    },
    {
      key: 'mockDriverId',
      value: 'b2c3d4e5-f6a7-8b9c-0d1e-2f3a4b5c6d7e',
      type: 'string',
      description: 'Mock Driver User ID (John Driver)'
    },
    {
      key: 'mockAdminId',
      value: 'c3d4e5f6-a7b8-9c0d-1e2f-3a4b5c6d7e8f',
      type: 'string',
      description: 'Mock Admin User ID (Sarah Admin)'
    },
    {
      key: 'activeRideId',
      value: 'd7a46f23-9524-4f81-9b13-bb1802a0a2df',
      type: 'string',
      description: 'Dynamically captured or active Ride UUID'
    },
    {
      key: 'activeRecurringProfileId',
      value: 'e8b57a34-0635-4a92-ac24-cc2913b1b3ea',
      type: 'string',
      description: 'Dynamically captured Recurring Ride Profile UUID'
    },
    {
      key: 'activeVehicleId',
      value: 'a9c68b45-1746-4b03-bd35-dd3024c2c4fb',
      type: 'string',
      description: 'Dynamically captured or active Vehicle UUID'
    },
    {
      key: 'activeTicketId',
      value: 'ba079c56-2857-4c14-ce46-ee4135d3d5ac',
      type: 'string',
      description: 'Dynamically captured or active Support Ticket UUID'
    },
    {
      key: 'activePromoId',
      value: 'cb18ad67-3968-4d25-df57-ff5246e4e6bd',
      type: 'string',
      description: 'Dynamically captured or active Promo Code UUID'
    },
    {
      key: 'activePromoCode',
      value: 'SUMMER25',
      type: 'string',
      description: 'Dynamically captured Promo Code string'
    },
    {
      key: 'activeAlertId',
      value: 'dc29be78-4a79-4e36-e068-006357f5f7ce',
      type: 'string',
      description: 'Dynamically captured or active Emergency SOS Alert UUID'
    },
    {
      key: 'activeReviewId',
      value: 'ed3acf89-5b80-4f47-f179-117468a6a8df',
      type: 'string',
      description: 'Dynamically captured Review UUID'
    },
    {
      key: 'activeEmergencyContactId',
      value: 'fe4bd09a-6c91-4058-028a-228579b7b9ea',
      type: 'string',
      description: 'Dynamically captured Emergency Contact UUID'
    },
    {
      key: 'driverProfileId',
      value: 'b2c3d4e5-f6a7-8b9c-0d1e-2f3a4b5c6d7e',
      type: 'string',
      description: 'Target Driver Profile UUID for admin KYC review'
    },
    {
      key: 'targetUserId',
      value: 'f47ac10b-58cc-4372-a567-0e02b2c3d479',
      type: 'string',
      description: 'Target User UUID for status updates'
    },
    {
      key: 'notificationId',
      value: '11223344-5566-7788-99aa-bbccddeeff00',
      type: 'string',
      description: 'Target Notification UUID'
    },
    {
      key: 'kycDocumentId',
      value: '22334455-6677-8899-aabb-ccddeeff0011',
      type: 'string',
      description: 'Target KYC Document UUID for admin document review'
    }
  ],
  item: []
};

// ─────────────────────────────────────────────────────────────────────────────
// 1. RIDES FOLDER
// ─────────────────────────────────────────────────────────────────────────────
const ridesFolder = {
  name: 'Rides',
  description: 'Ride lifecycle operations: GPS location tracking, nearby driver discovery, fare estimation, ride dispatch, recurring rides, driver trip progress, and tracking tokens.',
  item: [
    {
      name: 'Driver - Update Live GPS Location',
      event: [
        createPreRequestScript('DRIVER', 'mockDriverId'),
        createTestScript([
          'pm.test("Location updated successfully", function () {',
          '    pm.expect(pm.response.code).to.equal(200);',
          '    const json = pm.response.json();',
          '    pm.expect(json.success).to.be.true;',
          '});'
        ])
      ],
      request: {
        method: 'PATCH',
        header: authHeaders(),
        body: {
          mode: 'raw',
          raw: JSON.stringify({
            lat: 40.7128,
            lng: -74.0060
          }, null, 2),
          options: { raw: { language: 'json' } }
        },
        url: createUrl('{{baseUrl}}/rides/location'),
        description: 'Driver broadcasts live GPS coordinates to Redis geospatial index and Postgres.'
      }
    },
    {
      name: 'Customer - Search Nearby Available Drivers',
      event: [
        createPreRequestScript('CUSTOMER'),
        createTestScript([
          'pm.test("Nearby drivers retrieved", function () {',
          '    pm.expect(pm.response.code).to.equal(200);',
          '    const json = pm.response.json();',
          '    pm.expect(json.success).to.be.true;',
          '    pm.expect(json.data).to.be.an("array");',
          '});'
        ])
      ],
      request: {
        method: 'POST',
        header: authHeaders(),
        body: {
          mode: 'raw',
          raw: JSON.stringify({
            pickupLat: 40.7128,
            pickupLng: -74.0060
          }, null, 2),
          options: { raw: { language: 'json' } }
        },
        url: createUrl('{{baseUrl}}/rides/search'),
        description: 'Customer searches for approved, active, and available drivers within 5 km radius.'
      }
    },
    {
      name: 'Customer - Estimate Fare Across Vehicle Tiers',
      event: [
        createPreRequestScript('CUSTOMER'),
        createTestScript([
          'pm.test("Fare estimates computed", function () {',
          '    pm.expect(pm.response.code).to.equal(200);',
          '    const json = pm.response.json();',
          '    pm.expect(json.success).to.be.true;',
          '    pm.expect(json.data).to.be.an("array");',
          '});'
        ])
      ],
      request: {
        method: 'POST',
        header: authHeaders(),
        body: {
          mode: 'raw',
          raw: JSON.stringify({
            pickupLat: 40.7128,
            pickupLng: -74.0060,
            dropoffLat: 40.7589,
            dropoffLng: -73.9851,
            vehicleType: 'Sedan',
            promoCode: 'SUMMER25',
            stops: [
              {
                address: 'Empire State Building, New York, NY',
                lat: 40.7484,
                lng: -73.9857
              }
            ]
          }, null, 2),
          options: { raw: { language: 'json' } }
        },
        url: createUrl('{{baseUrl}}/rides/estimate'),
        description: 'Customer gets multi-stop fare estimates computed across vehicle categories with promo deduction and toll surcharges.'
      }
    },
    {
      name: 'Customer - Request Ride (Dispatch / Scheduled)',
      event: [
        createPreRequestScript('CUSTOMER'),
        createTestScript(
          [
            'pm.test("Ride created successfully", function () {',
            '    pm.expect(pm.response.code).to.be.oneOf([200, 201]);',
            '    const json = pm.response.json();',
            '    pm.expect(json.success).to.be.true;',
            '});'
          ],
          [
            'pm.test("Capture activeRideId into collection variables", function () {',
            '    const json = pm.response.json();',
            '    if (json?.data?.ride?.id) {',
            '        pm.collectionVariables.set("activeRideId", json.data.ride.id);',
            '        console.log("Captured activeRideId: " + json.data.ride.id);',
            '    }',
            '});'
          ]
        )
      ],
      request: {
        method: 'POST',
        header: authHeaders(),
        body: {
          mode: 'raw',
          raw: JSON.stringify({
            pickupLat: 40.7128,
            pickupLng: -74.0060,
            pickupAddress: '123 Main Street, New York, NY',
            dropoffLat: 40.7589,
            dropoffLng: -73.9851,
            dropoffAddress: 'Times Square, New York, NY',
            vehicleType: 'Sedan',
            estimatedFare: 24.50,
            stops: [
              {
                address: 'Empire State Building, New York, NY',
                lat: 40.7484,
                lng: -73.9857
              }
            ]
          }, null, 2),
          options: { raw: { language: 'json' } }
        },
        url: createUrl('{{baseUrl}}/rides/request'),
        description: 'Customer creates a ride record. Broadcasts dispatch notification to nearby drivers or queues for future scheduled execution.'
      }
    },
    {
      name: 'Customer - Create Recurring Ride Profile',
      event: [
        createPreRequestScript('CUSTOMER'),
        createTestScript(
          [
            'pm.test("Recurring profile created", function () {',
            '    pm.expect(pm.response.code).to.be.oneOf([200, 201]);',
            '    const json = pm.response.json();',
            '    pm.expect(json.success).to.be.true;',
            '});'
          ],
          [
            'pm.test("Capture activeRecurringProfileId into collection variables", function () {',
            '    const json = pm.response.json();',
            '    if (json?.data?.profile?.id) {',
            '        pm.collectionVariables.set("activeRecurringProfileId", json.data.profile.id);',
            '        console.log("Captured activeRecurringProfileId: " + json.data.profile.id);',
            '    }',
            '});'
          ]
        )
      ],
      request: {
        method: 'POST',
        header: authHeaders(),
        body: {
          mode: 'raw',
          raw: JSON.stringify({
            vehicleType: 'Sedan',
            pickupAddress: '123 Main Street, New York, NY',
            pickupLat: 40.7128,
            pickupLng: -74.0060,
            dropoffAddress: '456 Business Rd, New York, NY',
            dropoffLat: 40.7589,
            dropoffLng: -73.9851,
            daysOfWeek: [1, 2, 3, 4, 5],
            timeOfDay: '08:30',
            startDate: '2026-11-10T00:00:00.000Z',
            endDate: '2026-12-31T23:59:59.000Z'
          }, null, 2),
          options: { raw: { language: 'json' } }
        },
        url: createUrl('{{baseUrl}}/rides/recurring'),
        description: 'Customer creates a recurring scheduled ride template with weekly repeating days.'
      }
    },
    {
      name: 'Customer - Get My Recurring Profiles',
      event: [
        createPreRequestScript('CUSTOMER'),
        createTestScript([
          'pm.test("Recurring profiles fetched", function () {',
          '    pm.expect(pm.response.code).to.equal(200);',
          '    const json = pm.response.json();',
          '    pm.expect(json.success).to.be.true;',
          '});'
        ])
      ],
      request: {
        method: 'GET',
        header: authHeaders(),
        url: createUrl('{{baseUrl}}/rides/recurring'),
        description: 'Customer retrieves all active recurring ride profile templates.'
      }
    },
    {
      name: 'Admin - Trigger Recurring Ride Factory Sweep',
      event: [
        createPreRequestScript('ADMIN', 'mockAdminId'),
        createTestScript([
          'pm.test("Recurring ride factory sweep completed", function () {',
          '    pm.expect(pm.response.code).to.equal(200);',
          '    const json = pm.response.json();',
          '    pm.expect(json.success).to.be.true;',
          '});'
        ])
      ],
      request: {
        method: 'POST',
        header: authHeaders(),
        url: createUrl('{{baseUrl}}/rides/recurring/evaluate'),
        description: 'Admin triggers the evaluation engine to mint scheduled ride records for matching recurring profiles.'
      }
    },
    {
      name: 'Customer - Deactivate Recurring Profile',
      event: [
        createPreRequestScript('CUSTOMER'),
        createTestScript([
          'pm.test("Recurring profile deactivated", function () {',
          '    pm.expect(pm.response.code).to.equal(200);',
          '    const json = pm.response.json();',
          '    pm.expect(json.success).to.be.true;',
          '});'
        ])
      ],
      request: {
        method: 'DELETE',
        header: authHeaders(),
        url: createUrl(
          '{{baseUrl}}/rides/recurring/:id',
          [{ key: 'id', value: '{{activeRecurringProfileId}}', description: 'Recurring profile ID' }]
        ),
        description: 'Customer soft-deletes a recurring profile to stop automated generation.'
      }
    },
    {
      name: 'Driver - Atomically Accept Requested Ride',
      event: [
        createPreRequestScript('DRIVER', 'mockDriverId'),
        createTestScript([
          'pm.test("Ride accepted by driver", function () {',
          '    pm.expect(pm.response.code).to.equal(200);',
          '    const json = pm.response.json();',
          '    pm.expect(json.success).to.be.true;',
          '});'
        ])
      ],
      request: {
        method: 'PATCH',
        header: authHeaders(),
        url: createUrl(
          '{{baseUrl}}/rides/:id/accept',
          [{ key: 'id', value: '{{activeRideId}}', description: 'Ride ID to claim' }]
        ),
        description: 'Driver claims a REQUESTED ride atomically via Redis lock.'
      }
    },
    {
      name: 'Driver - Update Ride Status (Arrived / In Progress / Completed)',
      event: [
        createPreRequestScript('DRIVER', 'mockDriverId'),
        createTestScript([
          'pm.test("Ride status updated", function () {',
          '    pm.expect(pm.response.code).to.equal(200);',
          '    const json = pm.response.json();',
          '    pm.expect(json.success).to.be.true;',
          '});'
        ])
      ],
      request: {
        method: 'PATCH',
        header: authHeaders(),
        body: {
          mode: 'raw',
          raw: JSON.stringify({
            status: 'COMPLETED',
            actualDistanceKm: 6.8,
            actualDurationMinutes: 18.5,
            tolls: 2.50,
            waitingTimeMinutes: 3.0
          }, null, 2),
          options: { raw: { language: 'json' } }
        },
        url: createUrl(
          '{{baseUrl}}/rides/:id/status',
          [{ key: 'id', value: '{{activeRideId}}', description: 'Ride ID' }]
        ),
        description: 'Driver advances ride to DRIVER_ARRIVED, IN_PROGRESS, or COMPLETED (calculating final fare with tolls and waiting).'
      }
    },
    {
      name: 'Customer or Driver - Cancel Ride',
      event: [
        createTestScript([
          'pm.test("Ride cancelled", function () {',
          '    pm.expect(pm.response.code).to.equal(200);',
          '    const json = pm.response.json();',
          '    pm.expect(json.success).to.be.true;',
          '});'
        ])
      ],
      request: {
        method: 'POST',
        header: authHeaders(),
        body: {
          mode: 'raw',
          raw: JSON.stringify({
            reason: 'Passenger requested cancellation due to change of schedule'
          }, null, 2),
          options: { raw: { language: 'json' } }
        },
        url: createUrl(
          '{{baseUrl}}/rides/:id/cancel',
          [{ key: 'id', value: '{{activeRideId}}', description: 'Ride ID' }]
        ),
        description: 'Customer or Driver cancels a non-terminal ride with cancellation fee checks.'
      }
    },
    {
      name: 'Customer - Generate Live Trip Tracking Token (Share Ride)',
      event: [
        createPreRequestScript('CUSTOMER'),
        createTestScript([
          'pm.test("Share tracking link generated", function () {',
          '    pm.expect(pm.response.code).to.equal(200);',
          '    const json = pm.response.json();',
          '    pm.expect(json.success).to.be.true;',
          '    pm.expect(json.data.trackingToken).to.be.a("string");',
          '});'
        ])
      ],
      request: {
        method: 'POST',
        header: authHeaders(),
        url: createUrl(
          '{{baseUrl}}/rides/:id/share',
          [{ key: 'id', value: '{{activeRideId}}', description: 'Ride ID' }]
        ),
        description: 'Customer generates a 24-hour public tracking token and live share URL.'
      }
    }
  ]
};
collection.item.push(ridesFolder);

// ─────────────────────────────────────────────────────────────────────────────
// 2. DRIVERS FOLDER
// ─────────────────────────────────────────────────────────────────────────────
const driversFolder = {
  name: 'Drivers',
  description: 'Driver profile management, personal performance dashboard, trip history, and KYC document uploads.',
  item: [
    {
      name: 'Driver - Get Dashboard & Lifetime Metrics',
      event: [
        createPreRequestScript('DRIVER', 'mockDriverId'),
        createTestScript([
          'pm.test("Dashboard metrics fetched", function () {',
          '    pm.expect(pm.response.code).to.equal(200);',
          '    const json = pm.response.json();',
          '    pm.expect(json.success).to.be.true;',
          '});'
        ])
      ],
      request: {
        method: 'GET',
        header: authHeaders(),
        url: createUrl('{{baseUrl}}/drivers/me'),
        description: 'Driver dashboard with assigned vehicle, approval status, averageRating, totalRides, and completion stats.'
      }
    },
    {
      name: 'Driver - Get Paginated Trip History',
      event: [
        createPreRequestScript('DRIVER', 'mockDriverId'),
        createTestScript([
          'pm.test("Trip history fetched", function () {',
          '    pm.expect(pm.response.code).to.equal(200);',
          '    const json = pm.response.json();',
          '    pm.expect(json.success).to.be.true;',
          '});'
        ])
      ],
      request: {
        method: 'GET',
        header: authHeaders(),
        url: createUrl(
          '{{baseUrl}}/drivers/me/history?page=1&limit=10',
          [],
          [
            { key: 'page', value: '1', description: 'Page number (default: 1)' },
            { key: 'limit', value: '10', description: 'Results per page (max: 100)' }
          ]
        ),
        description: 'Paginated list of completed and cancelled trips for authenticated driver.'
      }
    },
    {
      name: 'Driver - Bulk Upload All 7 KYC Documents (Multipart)',
      event: [
        createPreRequestScript('DRIVER', 'mockDriverId'),
        createTestScript([
          'pm.test("KYC documents uploaded", function () {',
          '    pm.expect(pm.response.code).to.be.oneOf([200, 201]);',
          '    const json = pm.response.json();',
          '    pm.expect(json.success).to.be.true;',
          '});'
        ])
      ],
      request: {
        method: 'POST',
        header: multipartAuthHeaders(),
        body: {
          mode: 'formdata',
          formdata: [
            { key: 'DRIVING_LICENSE', type: 'file', description: 'Driver License document' },
            { key: 'NATIONAL_ID', type: 'file', description: 'National ID / Passport document' },
            { key: 'VEHICLE_REGISTRATION', type: 'file', description: 'Vehicle registration certificate' },
            { key: 'VEHICLE_INSURANCE', type: 'file', description: 'Vehicle insurance certificate' },
            { key: 'DRIVER_SELFIE', type: 'file', description: 'Recent driver headshot photo' },
            { key: 'PROOF_OF_ADDRESS', type: 'file', description: 'Utility bill or bank statement' },
            { key: 'TAX_ID', type: 'file', description: 'TIN / Tax ID document' },
            { key: 'DRIVING_LICENSE_expiryDate', value: '2030-12-31T00:00:00.000Z', type: 'text' },
            { key: 'VEHICLE_REGISTRATION_expiryDate', value: '2028-06-30T00:00:00.000Z', type: 'text' },
            { key: 'VEHICLE_INSURANCE_expiryDate', value: '2027-12-31T00:00:00.000Z', type: 'text' }
          ]
        },
        url: createUrl('{{baseUrl}}/drivers/documents'),
        description: 'Bulk upload of all 7 mandatory KYC documents directly streamed to Cloudinary.'
      }
    }
  ]
};
collection.item.push(driversFolder);

// ─────────────────────────────────────────────────────────────────────────────
// 3. VEHICLES FOLDER
// ─────────────────────────────────────────────────────────────────────────────
const vehiclesFolder = {
  name: 'Vehicles',
  description: 'Vehicle registration, photo inspection management, driver vehicle updates, and admin vehicle approval workflows.',
  item: [
    {
      name: 'Driver - Register Vehicle',
      event: [
        createPreRequestScript('DRIVER', 'mockDriverId'),
        createTestScript(
          [
            'pm.test("Vehicle registered successfully", function () {',
            '    pm.expect(pm.response.code).to.be.oneOf([200, 201]);',
            '    const json = pm.response.json();',
            '    pm.expect(json.success).to.be.true;',
            '});'
          ],
          [
            'pm.test("Capture activeVehicleId into collection variables", function () {',
            '    const json = pm.response.json();',
            '    if (json?.data?.id) {',
            '        pm.collectionVariables.set("activeVehicleId", json.data.id);',
            '        console.log("Captured activeVehicleId: " + json.data.id);',
            '    }',
            '});'
          ]
        )
      ],
      request: {
        method: 'POST',
        header: authHeaders(),
        body: {
          mode: 'raw',
          raw: JSON.stringify({
            vehicleClass: 'COMFORT',
            vehicleType: 'Sedan',
            brand: 'Toyota',
            model: 'Camry',
            year: 2023,
            color: 'Midnight Black',
            licensePlate: 'NYC-9821-TX',
            capacity: 4,
            registrationExpiryDate: '2028-12-31T00:00:00.000Z',
            insuranceExpiryDate: '2027-12-31T00:00:00.000Z'
          }, null, 2),
          options: { raw: { language: 'json' } }
        },
        url: createUrl('{{baseUrl}}/vehicles'),
        description: 'Driver registers their primary vehicle with class, model, license plate, and insurance.'
      }
    },
    {
      name: 'Driver - Get My Vehicle Details',
      event: [
        createPreRequestScript('DRIVER', 'mockDriverId'),
        createTestScript([
          'pm.test("Vehicle details fetched", function () {',
          '    pm.expect(pm.response.code).to.equal(200);',
          '    const json = pm.response.json();',
          '    pm.expect(json.success).to.be.true;',
          '});'
        ])
      ],
      request: {
        method: 'GET',
        header: authHeaders(),
        url: createUrl('{{baseUrl}}/vehicles/me'),
        description: 'Driver retrieves their currently registered vehicle with approval status.'
      }
    },
    {
      name: 'Driver - Update Vehicle Details (Resets to Pending Review)',
      event: [
        createPreRequestScript('DRIVER', 'mockDriverId'),
        createTestScript([
          'pm.test("Vehicle updated", function () {',
          '    pm.expect(pm.response.code).to.equal(200);',
          '    const json = pm.response.json();',
          '    pm.expect(json.success).to.be.true;',
          '});'
        ])
      ],
      request: {
        method: 'PATCH',
        header: authHeaders(),
        body: {
          mode: 'raw',
          raw: JSON.stringify({
            color: 'Pearl White',
            capacity: 4
          }, null, 2),
          options: { raw: { language: 'json' } }
        },
        url: createUrl('{{baseUrl}}/vehicles'),
        description: 'Driver updates vehicle specs. Resets approvalStatus back to PENDING_REVIEW.'
      }
    },
    {
      name: 'Driver - Upload Vehicle Photos (Multipart)',
      event: [
        createPreRequestScript('DRIVER', 'mockDriverId'),
        createTestScript([
          'pm.test("Vehicle photos uploaded", function () {',
          '    pm.expect(pm.response.code).to.be.oneOf([200, 201]);',
          '    const json = pm.response.json();',
          '    pm.expect(json.success).to.be.true;',
          '});'
        ])
      ],
      request: {
        method: 'POST',
        header: multipartAuthHeaders(),
        body: {
          mode: 'formdata',
          formdata: [
            { key: 'photos', type: 'file', description: 'Upload up to 5 vehicle inspection photos' }
          ]
        },
        url: createUrl('{{baseUrl}}/vehicles/photos'),
        description: 'Driver uploads up to 5 vehicle exterior and interior photos.'
      }
    },
    {
      name: 'Admin - List All Vehicles (Filter by Status)',
      event: [
        createPreRequestScript('ADMIN', 'mockAdminId'),
        createTestScript([
          'pm.test("Vehicles listed", function () {',
          '    pm.expect(pm.response.code).to.equal(200);',
          '    const json = pm.response.json();',
          '    pm.expect(json.success).to.be.true;',
          '});'
        ])
      ],
      request: {
        method: 'GET',
        header: authHeaders(),
        url: createUrl(
          '{{baseUrl}}/vehicles?status=PENDING_REVIEW',
          [],
          [{ key: 'status', value: 'PENDING_REVIEW', description: 'Filter by approval status' }]
        ),
        description: 'Admin lists vehicles with optional status filter (e.g. PENDING_REVIEW).'
      }
    },
    {
      name: 'Admin - Review Vehicle (Approve / Reject / Suspend)',
      event: [
        createPreRequestScript('ADMIN', 'mockAdminId'),
        createTestScript([
          'pm.test("Vehicle review decision submitted", function () {',
          '    pm.expect(pm.response.code).to.equal(200);',
          '    const json = pm.response.json();',
          '    pm.expect(json.success).to.be.true;',
          '});'
        ])
      ],
      request: {
        method: 'PATCH',
        header: authHeaders(),
        body: {
          mode: 'raw',
          raw: JSON.stringify({
            approvalStatus: 'APPROVED',
            adminNote: 'Vehicle registration, insurance, and photo inspection verified.'
          }, null, 2),
          options: { raw: { language: 'json' } }
        },
        url: createUrl(
          '{{baseUrl}}/vehicles/:id/review',
          [{ key: 'id', value: '{{activeVehicleId}}', description: 'Vehicle ID' }]
        ),
        description: 'Admin approves, rejects, or suspends vehicle registration.'
      }
    }
  ]
};
collection.item.push(vehiclesFolder);

// ─────────────────────────────────────────────────────────────────────────────
// 4. KYC FOLDER
// ─────────────────────────────────────────────────────────────────────────────
const kycFolder = {
  name: 'KYC',
  description: 'Know-Your-Customer verification portal: document requirements, submission checklists, admin review panels, and verification decisions.',
  item: [
    {
      name: 'Public - Get KYC Requirements Checklist',
      event: [
        createTestScript([
          'pm.test("Requirements list fetched", function () {',
          '    pm.expect(pm.response.code).to.equal(200);',
          '    const json = pm.response.json();',
          '    pm.expect(json.success).to.be.true;',
          '    pm.expect(json.data).to.be.an("array");',
          '});'
        ])
      ],
      request: {
        method: 'GET',
        header: [
          { key: 'Content-Type', value: 'application/json', type: 'text' }
        ],
        url: createUrl('{{baseUrl}}/kyc/requirements'),
        description: 'Returns static specifications of all 7 mandatory documents required for driver verification.'
      }
    },
    {
      name: 'Driver - Get KYC Checklist & Verification Status',
      event: [
        createPreRequestScript('DRIVER', 'mockDriverId'),
        createTestScript([
          'pm.test("KYC status fetched", function () {',
          '    pm.expect(pm.response.code).to.equal(200);',
          '    const json = pm.response.json();',
          '    pm.expect(json.success).to.be.true;',
          '});'
        ])
      ],
      request: {
        method: 'GET',
        header: authHeaders(),
        url: createUrl('{{baseUrl}}/kyc/status'),
        description: 'Driver checks document-by-document upload progress and current review decision.'
      }
    },
    {
      name: 'Driver - Bulk Upload All 7 KYC Documents (Multipart)',
      event: [
        createPreRequestScript('DRIVER', 'mockDriverId'),
        createTestScript([
          'pm.test("KYC documents uploaded", function () {',
          '    pm.expect(pm.response.code).to.be.oneOf([200, 201]);',
          '    const json = pm.response.json();',
          '    pm.expect(json.success).to.be.true;',
          '});'
        ])
      ],
      request: {
        method: 'POST',
        header: multipartAuthHeaders(),
        body: {
          mode: 'formdata',
          formdata: [
            { key: 'DRIVING_LICENSE', type: 'file', description: 'Driver License document' },
            { key: 'NATIONAL_ID', type: 'file', description: 'National ID / Passport document' },
            { key: 'VEHICLE_REGISTRATION', type: 'file', description: 'Vehicle registration certificate' },
            { key: 'VEHICLE_INSURANCE', type: 'file', description: 'Vehicle insurance certificate' },
            { key: 'DRIVER_SELFIE', type: 'file', description: 'Recent driver headshot photo' },
            { key: 'PROOF_OF_ADDRESS', type: 'file', description: 'Utility bill or bank statement' },
            { key: 'TAX_ID', type: 'file', description: 'TIN / Tax ID document' },
            { key: 'DRIVING_LICENSE_expiryDate', value: '2030-12-31T00:00:00.000Z', type: 'text' },
            { key: 'VEHICLE_REGISTRATION_expiryDate', value: '2028-06-30T00:00:00.000Z', type: 'text' },
            { key: 'VEHICLE_INSURANCE_expiryDate', value: '2027-12-31T00:00:00.000Z', type: 'text' }
          ]
        },
        url: createUrl('{{baseUrl}}/kyc/documents'),
        description: 'Driver submits all 7 KYC documents in a single atomic multipart request.'
      }
    },
    {
      name: 'Driver - Get My Uploaded Documents',
      event: [
        createPreRequestScript('DRIVER', 'mockDriverId'),
        createTestScript([
          'pm.test("Uploaded documents fetched", function () {',
          '    pm.expect(pm.response.code).to.equal(200);',
          '    const json = pm.response.json();',
          '    pm.expect(json.success).to.be.true;',
          '});'
        ])
      ],
      request: {
        method: 'GET',
        header: authHeaders(),
        url: createUrl('{{baseUrl}}/kyc/documents/me'),
        description: 'Driver views raw list of their uploaded KYC documents with secure CDN URLs.'
      }
    },
    {
      name: 'Admin - Get Pending KYC Documents',
      event: [
        createPreRequestScript('ADMIN', 'mockAdminId'),
        createTestScript([
          'pm.test("Pending KYC documents fetched", function () {',
          '    pm.expect(pm.response.code).to.equal(200);',
          '    const json = pm.response.json();',
          '    pm.expect(json.success).to.be.true;',
          '});'
        ])
      ],
      request: {
        method: 'GET',
        header: authHeaders(),
        url: createUrl('{{baseUrl}}/kyc/documents/pending'),
        description: 'Admin fetches all documents awaiting verification review.'
      }
    },
    {
      name: 'Admin - Get All KYC Documents',
      event: [
        createPreRequestScript('ADMIN', 'mockAdminId'),
        createTestScript([
          'pm.test("All KYC documents fetched", function () {',
          '    pm.expect(pm.response.code).to.equal(200);',
          '    const json = pm.response.json();',
          '    pm.expect(json.success).to.be.true;',
          '});'
        ])
      ],
      request: {
        method: 'GET',
        header: authHeaders(),
        url: createUrl('{{baseUrl}}/kyc/documents/all'),
        description: 'Admin fetches all documents across all statuses.'
      }
    },
    {
      name: 'Admin - Review Single KYC Document',
      event: [
        createPreRequestScript('ADMIN', 'mockAdminId'),
        createTestScript([
          'pm.test("Document review saved", function () {',
          '    pm.expect(pm.response.code).to.equal(200);',
          '    const json = pm.response.json();',
          '    pm.expect(json.success).to.be.true;',
          '});'
        ])
      ],
      request: {
        method: 'PATCH',
        header: authHeaders(),
        body: {
          mode: 'raw',
          raw: JSON.stringify({
            verificationStatus: 'APPROVED',
            reviewNote: 'Official government ID document verified against registry.'
          }, null, 2),
          options: { raw: { language: 'json' } }
        },
        url: createUrl(
          '{{baseUrl}}/kyc/documents/:id/review',
          [{ key: 'id', value: '{{kycDocumentId}}', description: 'Document ID' }]
        ),
        description: 'Admin marks single document as APPROVED, REJECTED, SUSPENDED, or TEMPORARILY_BLOCKED.'
      }
    }
  ]
};
collection.item.push(kycFolder);

// ─────────────────────────────────────────────────────────────────────────────
// 5. NOTIFICATIONS FOLDER
// ─────────────────────────────────────────────────────────────────────────────
const notificationsFolder = {
  name: 'Notifications',
  description: 'In-app notification inbox, read receipts, broadcast events, and external SMS dispatch test utility.',
  item: [
    {
      name: 'List Notifications Inbox (Paginated)',
      event: [
        createTestScript([
          'pm.test("Notifications list fetched", function () {',
          '    pm.expect(pm.response.code).to.equal(200);',
          '    const json = pm.response.json();',
          '    pm.expect(json.success).to.be.true;',
          '});'
        ])
      ],
      request: {
        method: 'GET',
        header: authHeaders(),
        url: createUrl(
          '{{baseUrl}}/notifications?page=1&limit=20&unread=false',
          [],
          [
            { key: 'page', value: '1', description: 'Page number' },
            { key: 'limit', value: '20', description: 'Items per page' },
            { key: 'unread', value: 'false', description: 'Filter unread only (true/false)' }
          ]
        ),
        description: 'Fetches paginated user notifications with optional unread filter.'
      }
    },
    {
      name: 'Mark All Notifications as Read',
      event: [
        createTestScript([
          'pm.test("All notifications marked as read", function () {',
          '    pm.expect(pm.response.code).to.equal(200);',
          '    const json = pm.response.json();',
          '    pm.expect(json.success).to.be.true;',
          '});'
        ])
      ],
      request: {
        method: 'PATCH',
        header: authHeaders(),
        url: createUrl('{{baseUrl}}/notifications/read-all'),
        description: 'Marks all unread notifications in the authenticated user inbox as read.'
      }
    },
    {
      name: 'Mark Single Notification as Read',
      event: [
        createTestScript([
          'pm.test("Notification marked as read", function () {',
          '    pm.expect(pm.response.code).to.equal(200);',
          '    const json = pm.response.json();',
          '    pm.expect(json.success).to.be.true;',
          '});'
        ])
      ],
      request: {
        method: 'PATCH',
        header: authHeaders(),
        url: createUrl(
          '{{baseUrl}}/notifications/:id/read',
          [{ key: 'id', value: '{{notificationId}}', description: 'Notification ID' }]
        ),
        description: 'Marks a specific notification as read after ownership verification.'
      }
    },
    {
      name: 'Test SMS Gateway Dispatch',
      event: [
        createTestScript([
          'pm.test("SMS dispatched", function () {',
          '    pm.expect(pm.response.code).to.equal(200);',
          '    const json = pm.response.json();',
          '    pm.expect(json.success).to.be.true;',
          '});'
        ])
      ],
      request: {
        method: 'POST',
        header: [
          { key: 'Content-Type', value: 'application/json', type: 'text' }
        ],
        body: {
          mode: 'raw',
          raw: JSON.stringify({
            phone: '+15551234567',
            message: 'Your Deligo driver is arriving in 2 minutes.'
          }, null, 2),
          options: { raw: { language: 'json' } }
        },
        url: createUrl('{{baseUrl}}/notifications/test-sms'),
        description: 'Utility endpoint to test BulkGate SMS provider integration.'
      }
    }
  ]
};
collection.item.push(notificationsFolder);

// ─────────────────────────────────────────────────────────────────────────────
// 6. PROMOTIONS FOLDER
// ─────────────────────────────────────────────────────────────────────────────
const promotionsFolder = {
  name: 'Promotions',
  description: 'Promo code lifecycle: Admin discount creation (flat/percentage) and customer fare validation before booking.',
  item: [
    {
      name: 'Admin - Create Promo Code',
      event: [
        createPreRequestScript('ADMIN', 'mockAdminId'),
        createTestScript(
          [
            'pm.test("Promo code created", function () {',
            '    pm.expect(pm.response.code).to.be.oneOf([200, 201]);',
            '    const json = pm.response.json();',
            '    pm.expect(json.success).to.be.true;',
            '});'
          ],
          [
            'pm.test("Capture activePromoId and activePromoCode into collection variables", function () {',
            '    const json = pm.response.json();',
            '    if (json?.data?.promoCode?.id) {',
            '        pm.collectionVariables.set("activePromoId", json.data.promoCode.id);',
            '        console.log("Captured activePromoId: " + json.data.promoCode.id);',
            '    }',
            '    if (json?.data?.promoCode?.code) {',
            '        pm.collectionVariables.set("activePromoCode", json.data.promoCode.code);',
            '        console.log("Captured activePromoCode: " + json.data.promoCode.code);',
            '    }',
            '});'
          ]
        )
      ],
      request: {
        method: 'POST',
        header: authHeaders(),
        body: {
          mode: 'raw',
          raw: JSON.stringify({
            code: 'SUMMER25',
            discountType: 'PERCENTAGE',
            discountValue: 25,
            maxDiscountCap: 10.00,
            minRideValue: 15.00,
            maxGlobalUses: 500,
            validFrom: '2026-11-01T00:00:00.000Z',
            validUntil: '2026-12-31T23:59:59.000Z',
            isActive: true
          }, null, 2),
          options: { raw: { language: 'json' } }
        },
        url: createUrl('{{baseUrl}}/promotions'),
        description: 'Admin creates a flat or percentage discount promo code with usage caps and date bounds.'
      }
    },
    {
      name: 'Customer - Validate Promo Code Against Fare',
      event: [
        createPreRequestScript('CUSTOMER'),
        createTestScript([
          'pm.test("Promo code validated", function () {',
          '    pm.expect(pm.response.code).to.equal(200);',
          '    const json = pm.response.json();',
          '    pm.expect(json.success).to.be.true;',
          '});'
        ])
      ],
      request: {
        method: 'POST',
        header: authHeaders(),
        body: {
          mode: 'raw',
          raw: JSON.stringify({
            code: '{{activePromoCode}}',
            estimatedFare: 35.00
          }, null, 2),
          options: { raw: { language: 'json' } }
        },
        url: createUrl('{{baseUrl}}/promotions/validate'),
        description: 'Customer checks promo code eligibility against an estimated fare before requesting.'
      }
    }
  ]
};
collection.item.push(promotionsFolder);

// ─────────────────────────────────────────────────────────────────────────────
// 7. REVIEWS FOLDER
// ─────────────────────────────────────────────────────────────────────────────
const reviewsFolder = {
  name: 'Reviews',
  description: 'Two-way ratings and feedback system between Customers and Drivers on completed rides.',
  item: [
    {
      name: 'Submit Review (Customer or Driver)',
      event: [
        createTestScript(
          [
            'pm.test("Review submitted successfully", function () {',
            '    pm.expect(pm.response.code).to.be.oneOf([200, 201]);',
            '    const json = pm.response.json();',
            '    pm.expect(json.success).to.be.true;',
            '});'
          ],
          [
            'pm.test("Capture activeReviewId into collection variables", function () {',
            '    const json = pm.response.json();',
            '    if (json?.data?.review?.id) {',
            '        pm.collectionVariables.set("activeReviewId", json.data.review.id);',
            '        console.log("Captured activeReviewId: " + json.data.review.id);',
            '    }',
            '});'
          ]
        )
      ],
      request: {
        method: 'POST',
        header: authHeaders(),
        body: {
          mode: 'raw',
          raw: JSON.stringify({
            rideId: '{{activeRideId}}',
            rating: 5,
            comment: 'Excellent ride! Smooth driving and very clean car.'
          }, null, 2),
          options: { raw: { language: 'json' } }
        },
        url: createUrl('{{baseUrl}}/reviews'),
        description: 'Customer or Driver submits a 1-5 star review and comment for a COMPLETED ride.'
      }
    },
    {
      name: 'Get Reviews Received About Me',
      event: [
        createTestScript([
          'pm.test("Reviews fetched", function () {',
          '    pm.expect(pm.response.code).to.equal(200);',
          '    const json = pm.response.json();',
          '    pm.expect(json.success).to.be.true;',
          '});'
        ])
      ],
      request: {
        method: 'GET',
        header: authHeaders(),
        url: createUrl('{{baseUrl}}/reviews/me'),
        description: 'Returns all reviews and ratings received by the authenticated user.'
      }
    }
  ]
};
collection.item.push(reviewsFolder);

// ─────────────────────────────────────────────────────────────────────────────
// 8. SUPPORT FOLDER
// ─────────────────────────────────────────────────────────────────────────────
const supportFolder = {
  name: 'Support',
  description: 'Emergency contacts, in-trip SOS alert dispatch, support ticketing system, and live ticket message threads.',
  item: [
    {
      name: 'Add Emergency Contact',
      event: [
        createTestScript(
          [
            'pm.test("Emergency contact added", function () {',
            '    pm.expect(pm.response.code).to.be.oneOf([200, 201]);',
            '    const json = pm.response.json();',
            '    pm.expect(json.success).to.be.true;',
            '});'
          ],
          [
            'pm.test("Capture activeEmergencyContactId into collection variables", function () {',
            '    const json = pm.response.json();',
            '    if (json?.data?.contact?.id) {',
            '        pm.collectionVariables.set("activeEmergencyContactId", json.data.contact.id);',
            '        console.log("Captured activeEmergencyContactId: " + json.data.contact.id);',
            '    }',
            '});'
          ]
        )
      ],
      request: {
        method: 'POST',
        header: authHeaders(),
        body: {
          mode: 'raw',
          raw: JSON.stringify({
            name: 'Alex Mercer',
            phoneNumber: '+15559876543',
            relation: 'Spouse'
          }, null, 2),
          options: { raw: { language: 'json' } }
        },
        url: createUrl('{{baseUrl}}/support/emergency-contacts'),
        description: 'Adds an emergency contact for the user (maximum 3 allowed per user).'
      }
    },
    {
      name: 'Get My Emergency Contacts',
      event: [
        createTestScript([
          'pm.test("Emergency contacts fetched", function () {',
          '    pm.expect(pm.response.code).to.equal(200);',
          '    const json = pm.response.json();',
          '    pm.expect(json.success).to.be.true;',
          '});'
        ])
      ],
      request: {
        method: 'GET',
        header: authHeaders(),
        url: createUrl('{{baseUrl}}/support/emergency-contacts'),
        description: 'Lists all registered emergency contacts for the user.'
      }
    },
    {
      name: 'Trigger Support SOS Alert',
      event: [
        createTestScript([
          'pm.test("SOS alert triggered", function () {',
          '    pm.expect(pm.response.code).to.equal(200);',
          '    const json = pm.response.json();',
          '    pm.expect(json.success).to.be.true;',
          '});'
        ])
      ],
      request: {
        method: 'POST',
        header: authHeaders(),
        body: {
          mode: 'raw',
          raw: JSON.stringify({
            rideId: '{{activeRideId}}',
            lat: 40.7128,
            lng: -74.0060
          }, null, 2),
          options: { raw: { language: 'json' } }
        },
        url: createUrl('{{baseUrl}}/support/sos'),
        description: 'Notifies admins, SMSes emergency contacts, and switches linked ride into EMERGENCY status.'
      }
    },
    {
      name: 'Create Support Ticket',
      event: [
        createTestScript(
          [
            'pm.test("Ticket created", function () {',
            '    pm.expect(pm.response.code).to.be.oneOf([200, 201]);',
            '    const json = pm.response.json();',
            '    pm.expect(json.success).to.be.true;',
            '});'
          ],
          [
            'pm.test("Capture activeTicketId into collection variables", function () {',
            '    const json = pm.response.json();',
            '    if (json?.data?.ticket?.id) {',
            '        pm.collectionVariables.set("activeTicketId", json.data.ticket.id);',
            '        console.log("Captured activeTicketId: " + json.data.ticket.id);',
            '    }',
            '});'
          ]
        )
      ],
      request: {
        method: 'POST',
        header: authHeaders(),
        body: {
          mode: 'raw',
          raw: JSON.stringify({
            subject: 'Lost bag in back seat',
            description: 'I left a black laptop backpack on the rear seat during my ride today. Please assist in contacting the driver.',
            type: 'LOST_ITEM',
            rideId: '{{activeRideId}}',
            priority: 'HIGH'
          }, null, 2),
          options: { raw: { language: 'json' } }
        },
        url: createUrl('{{baseUrl}}/support/tickets'),
        description: 'Creates a support ticket (SAFETY type auto-escalates to CRITICAL priority).'
      }
    },
    {
      name: 'Get My Support Tickets',
      event: [
        createTestScript([
          'pm.test("Tickets fetched", function () {',
          '    pm.expect(pm.response.code).to.equal(200);',
          '    const json = pm.response.json();',
          '    pm.expect(json.success).to.be.true;',
          '});'
        ])
      ],
      request: {
        method: 'GET',
        header: authHeaders(),
        url: createUrl('{{baseUrl}}/support/tickets'),
        description: 'Lists all tickets opened by the current user.'
      }
    },
    {
      name: 'Add Message to Support Ticket Thread',
      event: [
        createTestScript([
          'pm.test("Message added to ticket thread", function () {',
          '    pm.expect(pm.response.code).to.be.oneOf([200, 201]);',
          '    const json = pm.response.json();',
          '    pm.expect(json.success).to.be.true;',
          '});'
        ])
      ],
      request: {
        method: 'POST',
        header: authHeaders(),
        body: {
          mode: 'raw',
          raw: JSON.stringify({
            message: 'Thank you, I have checked with the driver and they found your item.'
          }, null, 2),
          options: { raw: { language: 'json' } }
        },
        url: createUrl(
          '{{baseUrl}}/support/tickets/:id/messages',
          [{ key: 'id', value: '{{activeTicketId}}', description: 'Ticket ID' }]
        ),
        description: 'Adds message to an ongoing support ticket thread (ticket owner or admin).'
      }
    }
  ]
};
collection.item.push(supportFolder);

// ─────────────────────────────────────────────────────────────────────────────
// 9. SAFETY FOLDER
// ─────────────────────────────────────────────────────────────────────────────
const safetyFolder = {
  name: 'Safety',
  description: 'Emergency safety desk: real-time SOS broadcasting, active alerts monitoring, and incident resolution.',
  item: [
    {
      name: 'Admin - Get All Active Emergency Alerts',
      event: [
        createPreRequestScript('ADMIN', 'mockAdminId'),
        createTestScript([
          'pm.test("Active safety alerts fetched", function () {',
          '    pm.expect(pm.response.code).to.equal(200);',
          '    const json = pm.response.json();',
          '    pm.expect(json.success).to.be.true;',
          '});'
        ])
      ],
      request: {
        method: 'GET',
        header: authHeaders(),
        url: createUrl('{{baseUrl}}/safety/sos/active'),
        description: 'Admin retrieves all unresolved SOS emergency alerts in real-time.'
      }
    },
    {
      name: 'Trigger SOS Alert (Customer or Driver)',
      event: [
        createTestScript(
          [
            'pm.test("SOS alert dispatched", function () {',
            '    pm.expect(pm.response.code).to.be.oneOf([200, 201]);',
            '    const json = pm.response.json();',
            '    pm.expect(json.success).to.be.true;',
            '});'
          ],
          [
            'pm.test("Capture activeAlertId into collection variables", function () {',
            '    const json = pm.response.json();',
            '    if (json?.data?.alert?.id) {',
            '        pm.collectionVariables.set("activeAlertId", json.data.alert.id);',
            '        console.log("Captured activeAlertId: " + json.data.alert.id);',
            '    }',
            '});'
          ]
        )
      ],
      request: {
        method: 'POST',
        header: authHeaders(),
        body: {
          mode: 'raw',
          raw: JSON.stringify({
            rideId: '{{activeRideId}}',
            lat: 40.7128,
            lng: -74.0060
          }, null, 2),
          options: { raw: { language: 'json' } }
        },
        url: createUrl('{{baseUrl}}/safety/sos'),
        description: 'Triggers emergency protocol: creates active alert, broadcasts via WebSocket to admin security desk, and dispatches SMS.'
      }
    },
    {
      name: 'Admin - Resolve Emergency Alert',
      event: [
        createPreRequestScript('ADMIN', 'mockAdminId'),
        createTestScript([
          'pm.test("Emergency alert resolved", function () {',
          '    pm.expect(pm.response.code).to.equal(200);',
          '    const json = pm.response.json();',
          '    pm.expect(json.success).to.be.true;',
          '});'
        ])
      ],
      request: {
        method: 'PATCH',
        header: authHeaders(),
        body: {
          mode: 'raw',
          raw: JSON.stringify({
            status: 'RESOLVED',
            notes: 'Emergency response team dispatched and verified passenger safety. Situation resolved.'
          }, null, 2),
          options: { raw: { language: 'json' } }
        },
        url: createUrl(
          '{{baseUrl}}/safety/sos/:id/resolve',
          [{ key: 'id', value: '{{activeAlertId}}', description: 'Alert ID' }]
        ),
        description: 'Admin marks alert as RESOLVED or FALSE_ALARM with detailed resolution notes.'
      }
    }
  ]
};
collection.item.push(safetyFolder);

// ─────────────────────────────────────────────────────────────────────────────
// 10. ADMIN FOLDER
// ─────────────────────────────────────────────────────────────────────────────
const adminFolder = {
  name: 'Admin',
  description: 'Full administrative suite: KYC reviews, user status moderation, platform ride dispatch controls, broadcast messaging, dynamic pricing rules, promo management, financial ledger, and BI analytics.',
  item: [
    {
      name: 'KYC - Get Pending Driver KYC Applications',
      event: [
        createPreRequestScript('ADMIN', 'mockAdminId'),
        createTestScript([
          'pm.test("Pending KYC drivers retrieved", function () {',
          '    pm.expect(pm.response.code).to.equal(200);',
          '    const json = pm.response.json();',
          '    pm.expect(json.success).to.be.true;',
          '});'
        ])
      ],
      request: {
        method: 'GET',
        header: authHeaders(),
        url: createUrl('{{baseUrl}}/admin/kyc/pending'),
        description: 'Lists all DriverProfiles under review with attached document URLs.'
      }
    },
    {
      name: 'KYC - Review Driver KYC Submission (Approve / Reject)',
      event: [
        createPreRequestScript('ADMIN', 'mockAdminId'),
        createTestScript([
          'pm.test("KYC review decision recorded", function () {',
          '    pm.expect(pm.response.code).to.equal(200);',
          '    const json = pm.response.json();',
          '    pm.expect(json.success).to.be.true;',
          '});'
        ])
      ],
      request: {
        method: 'PATCH',
        header: authHeaders(),
        body: {
          mode: 'raw',
          raw: JSON.stringify({
            kycStatus: 'APPROVED',
            reviewNote: 'All 7 documents inspected and verified against motor vehicles registry.'
          }, null, 2),
          options: { raw: { language: 'json' } }
        },
        url: createUrl(
          '{{baseUrl}}/admin/kyc/:driverProfileId',
          [{ key: 'driverProfileId', value: '{{driverProfileId}}', description: 'Driver Profile UUID' }]
        ),
        description: 'Approves or rejects driver KYC. Activates user and driver profile on approval.'
      }
    },
    {
      name: 'Users - List Users (Paginated & Filterable)',
      event: [
        createPreRequestScript('ADMIN', 'mockAdminId'),
        createTestScript([
          'pm.test("Users list retrieved", function () {',
          '    pm.expect(pm.response.code).to.equal(200);',
          '    const json = pm.response.json();',
          '    pm.expect(json.success).to.be.true;',
          '});'
        ])
      ],
      request: {
        method: 'GET',
        header: authHeaders(),
        url: createUrl(
          '{{baseUrl}}/admin/users?role=CUSTOMER&status=ACTIVE&page=1&limit=20',
          [],
          [
            { key: 'role', value: 'CUSTOMER', description: 'Filter by CUSTOMER or DRIVER' },
            { key: 'status', value: 'ACTIVE', description: 'Filter by ACTIVE, SUSPENDED, PENDING_VERIFICATION, DEACTIVATED' },
            { key: 'page', value: '1', description: 'Page number' },
            { key: 'limit', value: '20', description: 'Limit' }
          ]
        ),
        description: 'Paginated user management list with role and status filtering.'
      }
    },
    {
      name: 'Users - Update User Account Status',
      event: [
        createPreRequestScript('ADMIN', 'mockAdminId'),
        createTestScript([
          'pm.test("User account status updated", function () {',
          '    pm.expect(pm.response.code).to.equal(200);',
          '    const json = pm.response.json();',
          '    pm.expect(json.success).to.be.true;',
          '});'
        ])
      ],
      request: {
        method: 'PATCH',
        header: authHeaders(),
        body: {
          mode: 'raw',
          raw: JSON.stringify({
            status: 'SUSPENDED',
            reason: 'Temporary suspension pending investigation of policy violation report.'
          }, null, 2),
          options: { raw: { language: 'json' } }
        },
        url: createUrl(
          '{{baseUrl}}/admin/users/:userId/status',
          [{ key: 'userId', value: '{{targetUserId}}', description: 'User ID' }]
        ),
        description: 'Admin changes account status to ACTIVE, SUSPENDED, or DEACTIVATED.'
      }
    },
    {
      name: 'Support - List All Support Tickets',
      event: [
        createPreRequestScript('ADMIN', 'mockAdminId'),
        createTestScript([
          'pm.test("Admin tickets retrieved", function () {',
          '    pm.expect(pm.response.code).to.equal(200);',
          '    const json = pm.response.json();',
          '    pm.expect(json.success).to.be.true;',
          '});'
        ])
      ],
      request: {
        method: 'GET',
        header: authHeaders(),
        url: createUrl(
          '{{baseUrl}}/admin/support/tickets?status=OPEN&priority=HIGH&page=1&limit=20',
          [],
          [
            { key: 'status', value: 'OPEN', description: 'Filter by OPEN, IN_PROGRESS, RESOLVED' },
            { key: 'priority', value: 'HIGH', description: 'Filter by LOW, MEDIUM, HIGH, CRITICAL' },
            { key: 'page', value: '1', description: 'Page' },
            { key: 'limit', value: '20', description: 'Limit' }
          ]
        ),
        description: 'Admin retrieves platform-wide support tickets with filters.'
      }
    },
    {
      name: 'Support - Update Ticket Status / Priority',
      event: [
        createPreRequestScript('ADMIN', 'mockAdminId'),
        createTestScript([
          'pm.test("Ticket status updated", function () {',
          '    pm.expect(pm.response.code).to.equal(200);',
          '    const json = pm.response.json();',
          '    pm.expect(json.success).to.be.true;',
          '});'
        ])
      ],
      request: {
        method: 'PATCH',
        header: authHeaders(),
        body: {
          mode: 'raw',
          raw: JSON.stringify({
            status: 'IN_PROGRESS',
            priority: 'CRITICAL'
          }, null, 2),
          options: { raw: { language: 'json' } }
        },
        url: createUrl(
          '{{baseUrl}}/admin/support/tickets/:id',
          [{ key: 'id', value: '{{activeTicketId}}', description: 'Ticket ID' }]
        ),
        description: 'Admin updates ticket lifecycle state and priority.'
      }
    },
    {
      name: 'Support - Add Admin Message to Ticket',
      event: [
        createPreRequestScript('ADMIN', 'mockAdminId'),
        createTestScript([
          'pm.test("Admin message appended", function () {',
          '    pm.expect(pm.response.code).to.be.oneOf([200, 201]);',
          '    const json = pm.response.json();',
          '    pm.expect(json.success).to.be.true;',
          '});'
        ])
      ],
      request: {
        method: 'POST',
        header: authHeaders(),
        body: {
          mode: 'raw',
          raw: JSON.stringify({
            message: 'Deligo Safety Response Team is actively investigating this report.'
          }, null, 2),
          options: { raw: { language: 'json' } }
        },
        url: createUrl(
          '{{baseUrl}}/admin/support/tickets/:id/messages',
          [{ key: 'id', value: '{{activeTicketId}}', description: 'Ticket ID' }]
        ),
        description: 'Admin responds in the customer support ticket thread.'
      }
    },
    {
      name: 'Rides - List Platform Rides (Paginated)',
      event: [
        createPreRequestScript('ADMIN', 'mockAdminId'),
        createTestScript([
          'pm.test("Platform rides listed", function () {',
          '    pm.expect(pm.response.code).to.equal(200);',
          '    const json = pm.response.json();',
          '    pm.expect(json.success).to.be.true;',
          '});'
        ])
      ],
      request: {
        method: 'GET',
        header: authHeaders(),
        url: createUrl(
          '{{baseUrl}}/admin/rides?status=REQUESTED&page=1&limit=20',
          [],
          [
            { key: 'status', value: 'REQUESTED', description: 'Filter by ride status' },
            { key: 'page', value: '1', description: 'Page' },
            { key: 'limit', value: '20', description: 'Limit' }
          ]
        ),
        description: 'Admin monitors all platform rides with status filtering.'
      }
    },
    {
      name: 'Rides - Force Cancel Ride (Admin Override)',
      event: [
        createPreRequestScript('ADMIN', 'mockAdminId'),
        createTestScript([
          'pm.test("Ride cancelled by admin", function () {',
          '    pm.expect(pm.response.code).to.equal(200);',
          '    const json = pm.response.json();',
          '    pm.expect(json.success).to.be.true;',
          '});'
        ])
      ],
      request: {
        method: 'PATCH',
        header: authHeaders(),
        body: {
          mode: 'raw',
          raw: JSON.stringify({
            reason: 'Administrative cancellation due to driver vehicle breakdown.'
          }, null, 2),
          options: { raw: { language: 'json' } }
        },
        url: createUrl(
          '{{baseUrl}}/admin/rides/:id/cancel',
          [{ key: 'id', value: '{{activeRideId}}', description: 'Ride ID' }]
        ),
        description: 'Admin overrides and cancels any active ride.'
      }
    },
    {
      name: 'Notifications - Broadcast System Notification',
      event: [
        createPreRequestScript('ADMIN', 'mockAdminId'),
        createTestScript([
          'pm.test("Broadcast notification sent", function () {',
          '    pm.expect(pm.response.code).to.equal(200);',
          '    const json = pm.response.json();',
          '    pm.expect(json.success).to.be.true;',
          '});'
        ])
      ],
      request: {
        method: 'POST',
        header: authHeaders(),
        body: {
          mode: 'raw',
          raw: JSON.stringify({
            title: 'Severe Weather Advisory',
            message: 'Heavy snow conditions in downtown area. Expect longer wait times and drive safely.',
            targetRole: 'ALL'
          }, null, 2),
          options: { raw: { language: 'json' } }
        },
        url: createUrl('{{baseUrl}}/admin/notifications/broadcast'),
        description: 'Broadcasts an announcement notification to CUSTOMER, DRIVER, or ALL users.'
      }
    },
    {
      name: 'Pricing - Get All Vehicle Pricing Rules',
      event: [
        createPreRequestScript('ADMIN', 'mockAdminId'),
        createTestScript([
          'pm.test("Pricing rules fetched", function () {',
          '    pm.expect(pm.response.code).to.equal(200);',
          '    const json = pm.response.json();',
          '    pm.expect(json.success).to.be.true;',
          '});'
        ])
      ],
      request: {
        method: 'GET',
        header: authHeaders(),
        url: createUrl('{{baseUrl}}/admin/pricing'),
        description: 'Fetches pricing configuration across all vehicle classes.'
      }
    },
    {
      name: 'Pricing - Update Pricing Rule by Vehicle Type',
      event: [
        createPreRequestScript('ADMIN', 'mockAdminId'),
        createTestScript([
          'pm.test("Pricing rule updated", function () {',
          '    pm.expect(pm.response.code).to.equal(200);',
          '    const json = pm.response.json();',
          '    pm.expect(json.success).to.be.true;',
          '});'
        ])
      ],
      request: {
        method: 'PATCH',
        header: authHeaders(),
        body: {
          mode: 'raw',
          raw: JSON.stringify({
            baseFare: 3.50,
            perKmRate: 2.20,
            perMinRate: 0.18,
            surgeMultiplier: 1.2,
            adminFeePercentage: 20.0
          }, null, 2),
          options: { raw: { language: 'json' } }
        },
        url: createUrl(
          '{{baseUrl}}/admin/pricing/:vehicleType',
          [{ key: 'vehicleType', value: 'Sedan', description: 'Vehicle type enum' }]
        ),
        description: 'Modifies base fares, distance/time rates, surge multipliers, and platform commission.'
      }
    },
    {
      name: 'Promotions - List Platform Promotions',
      event: [
        createPreRequestScript('ADMIN', 'mockAdminId'),
        createTestScript([
          'pm.test("Promotions listed", function () {',
          '    pm.expect(pm.response.code).to.equal(200);',
          '    const json = pm.response.json();',
          '    pm.expect(json.success).to.be.true;',
          '});'
        ])
      ],
      request: {
        method: 'GET',
        header: authHeaders(),
        url: createUrl(
          '{{baseUrl}}/admin/promotions?page=1&limit=20',
          [],
          [
            { key: 'page', value: '1', description: 'Page' },
            { key: 'limit', value: '20', description: 'Limit' }
          ]
        ),
        description: 'Admin views all active and inactive promo codes with usage totals.'
      }
    },
    {
      name: 'Promotions - Deactivate or Toggle Promo Code',
      event: [
        createPreRequestScript('ADMIN', 'mockAdminId'),
        createTestScript([
          'pm.test("Promo code status changed", function () {',
          '    pm.expect(pm.response.code).to.equal(200);',
          '    const json = pm.response.json();',
          '    pm.expect(json.success).to.be.true;',
          '});'
        ])
      ],
      request: {
        method: 'PATCH',
        header: authHeaders(),
        body: {
          mode: 'raw',
          raw: JSON.stringify({
            isActive: false
          }, null, 2),
          options: { raw: { language: 'json' } }
        },
        url: createUrl(
          '{{baseUrl}}/admin/promotions/:id',
          [{ key: 'id', value: '{{activePromoId}}', description: 'Promo code ID' }]
        ),
        description: 'Deactivates or re-enables a promo code.'
      }
    },
    {
      name: 'Finances - Get Financial Ledger',
      event: [
        createPreRequestScript('ADMIN', 'mockAdminId'),
        createTestScript([
          'pm.test("Ledger records fetched", function () {',
          '    pm.expect(pm.response.code).to.equal(200);',
          '    const json = pm.response.json();',
          '    pm.expect(json.success).to.be.true;',
          '});'
        ])
      ],
      request: {
        method: 'GET',
        header: authHeaders(),
        url: createUrl(
          '{{baseUrl}}/admin/finances/ledger?startDate=2026-01-01T00:00:00.000Z&endDate=2026-12-31T23:59:59.000Z',
          [],
          [
            { key: 'startDate', value: '2026-01-01T00:00:00.000Z', description: 'ISO start date' },
            { key: 'endDate', value: '2026-12-31T23:59:59.000Z', description: 'ISO end date' }
          ]
        ),
        description: 'Audit log of platform commissions, driver earnings, and customer transactions.'
      }
    },
    {
      name: 'Analytics - High-Level KPI Dashboard',
      event: [
        createPreRequestScript('ADMIN', 'mockAdminId'),
        createTestScript([
          'pm.test("KPI dashboard retrieved", function () {',
          '    pm.expect(pm.response.code).to.equal(200);',
          '    const json = pm.response.json();',
          '    pm.expect(json.success).to.be.true;',
          '});'
        ])
      ],
      request: {
        method: 'GET',
        header: authHeaders(),
        url: createUrl('{{baseUrl}}/admin/analytics/dashboard'),
        description: 'Executive dashboard KPI metrics: total rides, active drivers, gross revenue, net commission.'
      }
    },
    {
      name: 'Analytics - Temporal Revenue & Trip Trends',
      event: [
        createPreRequestScript('ADMIN', 'mockAdminId'),
        createTestScript([
          'pm.test("Trends data retrieved", function () {',
          '    pm.expect(pm.response.code).to.equal(200);',
          '    const json = pm.response.json();',
          '    pm.expect(json.success).to.be.true;',
          '});'
        ])
      ],
      request: {
        method: 'GET',
        header: authHeaders(),
        url: createUrl(
          '{{baseUrl}}/admin/analytics/trends?interval=DAILY&startDate=2026-01-01T00:00:00.000Z&endDate=2026-01-31T23:59:59.000Z',
          [],
          [
            { key: 'interval', value: 'DAILY', description: 'DAILY, WEEKLY, or MONTHLY' },
            { key: 'startDate', value: '2026-01-01T00:00:00.000Z', description: 'Start date' },
            { key: 'endDate', value: '2026-01-31T23:59:59.000Z', description: 'End date' }
          ]
        ),
        description: 'Time-series aggregated analytics for revenue, trips, and driver activity.'
      }
    },
    {
      name: 'Analytics - Export Operational Report CSV',
      event: [
        createPreRequestScript('ADMIN', 'mockAdminId'),
        createTestScript([
          'pm.test("Export generated", function () {',
          '    pm.expect(pm.response.code).to.equal(200);',
          '});'
        ])
      ],
      request: {
        method: 'GET',
        header: authHeaders(),
        url: createUrl(
          '{{baseUrl}}/admin/analytics/export?reportType=REVENUE',
          [],
          [{ key: 'reportType', value: 'REVENUE', description: 'REVENUE, RIDES, or DRIVERS' }]
        ),
        description: 'Streams downloadable CSV export of business performance reports.'
      }
    }
  ]
};
collection.item.push(adminFolder);

// ─────────────────────────────────────────────────────────────────────────────
// 11. USERS FOLDER
// ─────────────────────────────────────────────────────────────────────────────
const usersFolder = {
  name: 'Users',
  description: 'User profile management (role-aware customer and driver profiles) and FCM device push token registration.',
  item: [
    {
      name: 'Save / Replace FCM Push Notification Token',
      event: [
        createTestScript([
          'pm.test("FCM token saved", function () {',
          '    pm.expect(pm.response.code).to.equal(200);',
          '    const json = pm.response.json();',
          '    pm.expect(json.success).to.be.true;',
          '});'
        ])
      ],
      request: {
        method: 'PATCH',
        header: authHeaders(),
        body: {
          mode: 'raw',
          raw: JSON.stringify({
            fcmToken: 'eK3f_81mR0e:APA91bF9s7wP_sample_device_fcm_token_string_Lw80a'
          }, null, 2),
          options: { raw: { language: 'json' } }
        },
        url: createUrl('{{baseUrl}}/users/fcm-token'),
        description: 'Registers or updates device FCM token for push notifications.'
      }
    },
    {
      name: 'Get My Profile (Role-Aware)',
      event: [
        createTestScript([
          'pm.test("Profile fetched", function () {',
          '    pm.expect(pm.response.code).to.equal(200);',
          '    const json = pm.response.json();',
          '    pm.expect(json.success).to.be.true;',
          '});'
        ])
      ],
      request: {
        method: 'GET',
        header: authHeaders(),
        url: createUrl('{{baseUrl}}/profile/me'),
        description: 'Fetches full customer or driver profile based on authenticated identity.'
      }
    },
    {
      name: 'Update My Profile (Role-Aware)',
      event: [
        createTestScript([
          'pm.test("Profile updated", function () {',
          '    pm.expect(pm.response.code).to.equal(200);',
          '    const json = pm.response.json();',
          '    pm.expect(json.success).to.be.true;',
          '});'
        ])
      ],
      request: {
        method: 'PATCH',
        header: authHeaders(),
        body: {
          mode: 'raw',
          raw: JSON.stringify({
            firstName: 'Jane',
            lastName: 'Customer',
            phone: '+15550001111',
            homeAddress: '123 Main Street, New York, NY',
            workAddress: '456 Business Rd, New York, NY',
            emergencyContactNumber: '+15559998888'
          }, null, 2),
          options: { raw: { language: 'json' } }
        },
        url: createUrl('{{baseUrl}}/profile/me'),
        description: 'Updates personal info (home/work addresses for customers; phone/name for drivers).'
      }
    }
  ]
};
collection.item.push(usersFolder);

// Write to deligo-postman-collection.json
const outputPath = path.resolve(process.cwd(), 'deligo-postman-collection.json');
const jsonString = JSON.stringify(collection, null, 2);
fs.writeFileSync(outputPath, jsonString, 'utf-8');

console.log(`✅ Postman Collection v2.1 generated successfully at: ${outputPath}`);
console.log(`Total Folders: ${collection.item.length}`);
let totalRequests = 0;
collection.item.forEach(folder => {
  totalRequests += folder.item.length;
  console.log(` - ${folder.name}: ${folder.item.length} requests`);
});
console.log(`Total Requests: ${totalRequests}`);

