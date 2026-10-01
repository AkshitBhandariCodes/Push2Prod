import { S3Client, PutObjectCommand, CreateBucketCommand, HeadBucketCommand } from '@aws-sdk/client-s3';
import { config } from '@push2prod/config';
import { logger } from '@push2prod/logger';
import fs from 'fs/promises';
import path from 'path';
import mime from 'mime-types';

// Initialize S3 Client
const s3Config: any = {
  region: config.s3.region,
  forcePathStyle: config.s3.forcePathStyle, // Required for MinIO
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

const s3Client = new S3Client(s3Config);

const BUCKET_NAME = config.s3.bucketName;

/**
 * Ensures the bucket exists. If not, it creates it.
 */
export const ensureBucketExists = async () => {
  try {
    await s3Client.send(new HeadBucketCommand({ Bucket: BUCKET_NAME }));
  } catch (error: any) {
    if (error.name === 'NotFound' || error.$metadata?.httpStatusCode === 404) {
      logger.info(`Bucket ${BUCKET_NAME} does not exist. Creating it...`);
      await s3Client.send(new CreateBucketCommand({ Bucket: BUCKET_NAME }));
      logger.info(`Bucket ${BUCKET_NAME} created successfully.`);
    } else {
      throw error;
    }
  }
};

/**
 * Recursively gets all files in a directory
 */
const getFilesRecursively = async (dir: string, fileList: string[] = []): Promise<string[]> => {
  const files = await fs.readdir(dir);
  for (const file of files) {
    const filePath = path.join(dir, file);
    const stat = await fs.stat(filePath);
    if (stat.isDirectory()) {
      await getFilesRecursively(filePath, fileList);
    } else {
      fileList.push(filePath);
    }
  }
  return fileList;
};

/**
 * Uploads an entire directory to S3/MinIO
 * @param sourceDir Local directory path to upload
 * @param prefix Prefix for the S3 object keys
 * @returns Total number of files uploaded
 */
export const uploadDirectoryToS3 = async (sourceDir: string, prefix: string): Promise<number> => {
  await ensureBucketExists();

  const allFiles = await getFilesRecursively(sourceDir);
  if (allFiles.length === 0) {
    logger.warn(`No files found in directory ${sourceDir} to upload.`);
    return 0;
  }

  const uploadPromises = allFiles.map(async (filePath) => {
    // Relative path to maintain folder structure in S3
    const relativePath = path.relative(sourceDir, filePath);
    // Replace windows backslashes with forward slashes for S3 keys
    const s3Key = path.join(prefix, relativePath).replace(/\\/g, '/');

    const fileContent = await fs.readFile(filePath);
    const contentType = mime.lookup(filePath) || 'application/octet-stream';

    const command = new PutObjectCommand({
      Bucket: BUCKET_NAME,
      Key: s3Key,
      Body: fileContent,
      ContentType: contentType,
    });

    await s3Client.send(command);
  });

  await Promise.all(uploadPromises);
  logger.info(`Successfully uploaded ${allFiles.length} files to s3://${BUCKET_NAME}/${prefix}`);
  
  return allFiles.length;
};
