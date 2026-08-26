import { db } from '@push2prod/db';
import { S3Client, ListObjectsV2Command } from '@aws-sdk/client-s3';
import { config } from '@push2prod/config';

async function run() {
  const s3Client = new S3Client({
    region: config.s3.region,
    endpoint: config.s3.endpoint,
    credentials: {
      accessKeyId: config.s3.accessKeyId,
      secretAccessKey: config.s3.secretAccessKey,
    },
    forcePathStyle: config.s3.forcePathStyle,
  });

  const deployment = await db.deployment.findFirst({
    where: { project: { slug: 'tourex-client' }, status: 'READY' },
    orderBy: { createdAt: 'desc' }
  });

  if (!deployment) {
    console.log('No deployment found');
    return;
  }

  console.log(`Prefix: ${deployment.artifactPrefix}`);

  const command = new ListObjectsV2Command({
    Bucket: config.s3.bucketName,
    Prefix: deployment.artifactPrefix!
  });

  const response = await s3Client.send(command);
  console.log('Files:');
  response.Contents?.slice(0, 20).forEach(f => console.log(f.Key));
}

run().catch(console.error);
