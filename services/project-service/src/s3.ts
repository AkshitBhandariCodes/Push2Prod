import { S3Client, ListObjectsV2Command, DeleteObjectsCommand, ListObjectsV2CommandInput, _Object } from '@aws-sdk/client-s3';
import { config } from '@push2prod/config';
import { logger } from '@push2prod/logger';

const s3Config: any = {
  region: config.s3.region,
  forcePathStyle: config.s3.forcePathStyle,
};

if (config.s3.endpoint) {
  s3Config.endpoint = config.s3.endpoint;
}

if (config.s3.accessKeyId && config.s3.secretAccessKey) {
  s3Config.credentials = {
    accessKeyId: config.s3.accessKeyId,
    secretAccessKey: config.s3.secretAccessKey,
  };
}

export const s3Client = new S3Client(s3Config);
export const BUCKET_NAME = config.s3.bucketName;

/**
 * Recursively deletes all S3 objects under a given directory prefix.
 * This completely frees up S3 storage space so you are not billed.
 */
export async function emptyS3Directory(bucket: string, dir: string): Promise<number> {
  const prefix = dir.endsWith('/') ? dir : `${dir}/`;
  let totalDeleted = 0;
  let continuationToken: string | undefined = undefined;

  do {
    const listParams: ListObjectsV2CommandInput = {
      Bucket: bucket,
      Prefix: prefix,
      ContinuationToken: continuationToken,
    };

    const listedObjects = await s3Client.send(new ListObjectsV2Command(listParams));

    if (listedObjects.Contents && listedObjects.Contents.length > 0) {
      const objectsToDelete = listedObjects.Contents
        .map((item: _Object) => ({ Key: item.Key }))
        .filter((obj) => Boolean(obj.Key)) as { Key: string }[];

      if (objectsToDelete.length > 0) {
        await s3Client.send(
          new DeleteObjectsCommand({
            Bucket: bucket,
            Delete: {
              Objects: objectsToDelete,
              Quiet: true,
            },
          })
        );
        totalDeleted += objectsToDelete.length;
      }
    }

    continuationToken = listedObjects.NextContinuationToken;
  } while (continuationToken);

  logger.info(`Cleaned up ${totalDeleted} S3 objects under '${prefix}' in bucket '${bucket}'`);
  return totalDeleted;
}
