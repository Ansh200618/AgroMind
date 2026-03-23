/**
 * Prisma seed — populates the database with realistic demo data
 * matching the MOCK objects in index.html so the frontend renders
 * real data from the API.
 *
 * Run: npx ts-node prisma/seed.ts
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Seeding Agro Mind database…');

  // ── 1. User ──────────────────────────────────────────────────────────────
  const user = await prisma.user.upsert({
    where: { email: 'farmer@agromind.local' },
    update: {},
    create: {
      email: 'farmer@agromind.local',
      name:  'Gurpreet Singh',
      phone: '+91-98140-00001',
    },
  });

  // ── 2. Farm ──────────────────────────────────────────────────────────────
  const farm = await prisma.farm.upsert({
    where: { id: 'farm-ludhiana-1' },
    update: {},
    create: {
      id:          'farm-ludhiana-1',
      name:        'Singh Family Farm',
      ownerName:   'Gurpreet Singh',
      totalAreaHa: 12.5,
      village:     'Sahnewal',
      district:    'Ludhiana',
      state:       'Punjab',
      latitude:    30.9010,
      longitude:   75.8573,
      waterSource: 'borewell',
      userId:      user.id,
    },
  });

  // ── 3. User Settings ──────────────────────────────────────────────────────
  await prisma.userSettings.upsert({
    where: { userId: user.id },
    update: {},
    create: {
      userId:        user.id,
      alertLanguage: 'English',
      autoIrrigation: false,
      weatherAlerts:  true,
      diseaseAlerts:  true,
      smsAlerts:      false,
      mandiPrices:    false,
    },
  });

  // ── 4. Fields ─────────────────────────────────────────────────────────────
  const fields = await Promise.all([
    prisma.field.upsert({
      where: { id: 'field-a' },
      update: {},
      create: {
        id: 'field-a', name: 'Field A', areaHa: 3.0, farmId: farm.id,
        cropType: 'Wheat',   cropSeason: 'rabi', soilType: 'loamy', soilPh: 6.7,
        latitude: 30.9015, longitude: 75.8578,
      },
    }),
    prisma.field.upsert({
      where: { id: 'field-b' },
      update: {},
      create: {
        id: 'field-b', name: 'Field B', areaHa: 2.5, farmId: farm.id,
        cropType: 'Rice',    cropSeason: 'kharif', soilType: 'clay', soilPh: 6.2,
        latitude: 30.9020, longitude: 75.8565,
      },
    }),
    prisma.field.upsert({
      where: { id: 'field-c' },
      update: {},
      create: {
        id: 'field-c', name: 'Field C', areaHa: 2.0, farmId: farm.id,
        cropType: 'Cotton',  cropSeason: 'kharif', soilType: 'black', soilPh: 7.1,
        latitude: 30.9025, longitude: 75.8560,
      },
    }),
    prisma.field.upsert({
      where: { id: 'field-d' },
      update: {},
      create: {
        id: 'field-d', name: 'Field D', areaHa: 2.5, farmId: farm.id,
        cropType: 'Maize',   cropSeason: 'kharif', soilType: 'loamy', soilPh: 6.9,
        latitude: 30.9005, longitude: 75.8585,
      },
    }),
    prisma.field.upsert({
      where: { id: 'field-e' },
      update: {},
      create: {
        id: 'field-e', name: 'Field E', areaHa: 2.5, farmId: farm.id,
        cropType: 'Mustard', cropSeason: 'rabi', soilType: 'sandy', soilPh: 7.4,
        latitude: 30.9000, longitude: 75.8570,
      },
    }),
  ]);

  const [fieldA, fieldB, fieldC, fieldD, fieldE] = fields;

  // ── 5. Sensors ────────────────────────────────────────────────────────────
  const sensors = await Promise.all([
    prisma.sensor.upsert({
      where: { deviceId: 'S-01' },
      update: {},
      create: { deviceId:'S-01', name:'Field A Moisture', type:'soil_moisture', status:'online', farmId:farm.id, fieldId:fieldA.id, lastSeenAt:new Date() },
    }),
    prisma.sensor.upsert({
      where: { deviceId: 'S-02' },
      update: {},
      create: { deviceId:'S-02', name:'Field B Moisture', type:'soil_moisture', status:'online', farmId:farm.id, fieldId:fieldB.id, lastSeenAt:new Date() },
    }),
    prisma.sensor.upsert({
      where: { deviceId: 'S-03' },
      update: {},
      create: { deviceId:'S-03', name:'Field C Moisture', type:'soil_moisture', status:'online', farmId:farm.id, fieldId:fieldC.id, lastSeenAt:new Date() },
    }),
    prisma.sensor.upsert({
      where: { deviceId: 'S-04' },
      update: {},
      create: { deviceId:'S-04', name:'Field D Moisture', type:'soil_moisture', status:'online', farmId:farm.id, fieldId:fieldD.id, lastSeenAt:new Date() },
    }),
    prisma.sensor.upsert({
      where: { deviceId: 'S-05' },
      update: {},
      create: { deviceId:'S-05', name:'Field E Moisture', type:'soil_moisture', status:'low_battery', farmId:farm.id, fieldId:fieldE.id, lastSeenAt:new Date() },
    }),
    prisma.sensor.upsert({
      where: { deviceId: 'S-06' },
      update: {},
      create: { deviceId:'S-06', name:'Weather Station',  type:'weather_station', status:'online', farmId:farm.id, lastSeenAt:new Date() },
    }),
  ]);

  // ── 6. Sensor readings (latest + 7-day history) ───────────────────────────
  const latestReadings = [
    { sensor: sensors[0], moisture: 72, temperature: 23, ph: 6.7 },
    { sensor: sensors[1], moisture: 85, temperature: 25, ph: 6.2 },
    { sensor: sensors[2], moisture: 41, temperature: 27, ph: 7.1 },
    { sensor: sensors[3], moisture: 63, temperature: 24, ph: 6.9 },
    { sensor: sensors[4], moisture: 29, temperature: 28, ph: 7.4 },
    { sensor: sensors[5], humidity: 62, temperature: 28, windSpeed: 8 },
  ];
  for (const r of latestReadings) {
    await prisma.sensorReading.create({
      data: {
        sensorId:    r.sensor.id,
        moisture:    'moisture'    in r ? r.moisture    : null,
        temperature: r.temperature,
        ph:          'ph'          in r ? r.ph          : null,
        humidity:    'humidity'    in r ? r.humidity    : null,
        windSpeed:   'windSpeed'   in r ? r.windSpeed   : null,
        recordedAt:  new Date(),
      },
    });
  }

  // ── 7. Today's irrigation schedule ────────────────────────────────────────
  const today = new Date();
  const irrEntries = [
    { field: fieldA, hour: 6,  min: 0,  water: 380, dur: 25, status: 'done'      },
    { field: fieldB, hour: 9,  min: 30, water: 420, dur: 30, status: 'done'      },
    { field: fieldC, hour: 14, min: 15, water: 310, dur: 22, status: 'active'    },
    { field: fieldD, hour: 16, min: 0,  water: 290, dur: 20, status: 'scheduled' },
    { field: fieldE, hour: 17, min: 30, water: 340, dur: 24, status: 'urgent'    },
  ];
  for (const e of irrEntries) {
    const scheduled = new Date(today);
    scheduled.setHours(e.hour, e.min, 0, 0);
    await prisma.irrigationLog.create({
      data: {
        fieldId:     e.field.id,
        status:      e.status,
        scheduledAt: scheduled,
        startedAt:   e.status === 'done' || e.status === 'active' ? scheduled : null,
        completedAt: e.status === 'done' ? new Date(scheduled.getTime() + e.dur * 60_000) : null,
        waterUsedL:  e.water,
        durationMin: e.dur,
      },
    });
  }

  // ── 8. 7-day irrigation history (for water chart) ─────────────────────────
  const waterByDay = [2100, 1850, 2300, 1700, 2050, 1600];
  for (let i = 6; i >= 1; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    d.setHours(10, 0, 0, 0);
    await prisma.irrigationLog.create({
      data: {
        fieldId:     fieldA.id,
        status:      'done',
        scheduledAt: d,
        startedAt:   d,
        completedAt: new Date(d.getTime() + 60 * 60_000),
        waterUsedL:  waterByDay[6 - i],
        durationMin: 60,
      },
    });
  }

  // ── 9. Disease logs ───────────────────────────────────────────────────────
  const dis1 = new Date(); dis1.setHours(9, 42, 0, 0);
  const dis2 = new Date(); dis2.setDate(dis2.getDate() - 1);
  const dis3 = new Date('2024-10-14T14:00:00Z');
  const dis4 = new Date('2024-10-12T10:00:00Z');

  await prisma.diseaseLog.createMany({
    data: [
      { imageUrl:'/uploads/demo1.jpg', resultType:'danger',  diseaseName:'Leaf Blight', confidence:94, description:'Early-stage blight detected. Recommend fungicide within 48hrs.',    treatment:'Spray Mancozeb 75 WP @ 2.5 g/litre.',           colourHex:'#c0392b', fieldId:fieldA.id, createdAt:dis1 },
      { imageUrl:'/uploads/demo2.jpg', resultType:'healthy', diseaseName:'Healthy Leaf',confidence:99, description:'No disease detected. Good colour and structure.',                    treatment:null,                                             colourHex:'#3d8b47', fieldId:fieldB.id, createdAt:dis2 },
      { imageUrl:'/uploads/demo3.jpg', resultType:'warning', diseaseName:'Rust Spot',   confidence:87, description:'Mild rust spots. Monitor for 3–5 days.',                            treatment:'Apply sulphur-based fungicide @ 3 g/litre.',     colourHex:'#e6a817', fieldId:fieldC.id, createdAt:dis3 },
      { imageUrl:'/uploads/demo4.jpg', resultType:'healthy', diseaseName:'Healthy Leaf',confidence:97, description:'No disease detected. Continue normal care.',                        treatment:null,                                             colourHex:'#3d8b47', fieldId:fieldD.id, createdAt:dis4 },
    ],
  });

  console.log('✅ Seed complete!');
  console.log(`   Users: 1  |  Farms: 1  |  Fields: 5  |  Sensors: 6`);
  console.log(`   Sensor readings: ${latestReadings.length}  |  Irrigation logs: ${irrEntries.length + 6}  |  Disease logs: 4`);
}

main()
  .catch(e => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
