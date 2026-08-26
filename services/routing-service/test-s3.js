const { S3Client, ListObjectsV2Command } = require('@aws-sdk/client-s3');
const s3 = new S3Client({
  endpoint: 'http://127.0.0.1:9000',
  region: 'us-east-1',
  credentials: { accessKeyId: 'minioadmin', secretAccessKey: 'minioadmin' },
  forcePathStyle: true
});
s3.send(new ListObjectsV2Command({ Bucket: 'push2prod-builds', Prefix: 'deployments/be27303d-e5bd-4c5d-8b58-dbc7a9139d58/' }))
  .then(d => console.log(JSON.stringify(d.Contents?.map(c => c.Key), null, 2)))
  .catch(console.error);
