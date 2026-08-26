import { S3Client, ListObjectsV2Command } from '@aws-sdk/client-s3';

const s3Client = new S3Client({
  region: 'us-east-1',
  endpoint: 'http://localhost:9000',
  credentials: {
    accessKeyId: 'minioadmin',
    secretAccessKey: 'minioadmin',
  },
  forcePathStyle: true,
});

async function run() {
  const command = new ListObjectsV2Command({
    Bucket: 'push2prod-artifacts',
  });
  const res = await s3Client.send(command);
  console.log('Files in S3:');
  res.Contents?.forEach(c => console.log(c.Key));
}
run();
