import Bull from 'bull';
import dbClient from './utils/db.js';
import path from 'path';
import fs from 'fs/promises';
import ImageThumbnail from 'image-thumbnail';
import dotenv from 'dotenv';

// Load environment variables from .env file
dotenv.config();

// Initialize Bull Queue
const fileQueue = new Bull('fileQueue', {
  redis: {
    host: process.env.REDIS_HOST || '127.0.0.1',
    port: process.env.REDIS_PORT || 6379,
  },
});

// Process jobs
fileQueue.process(async (job) => {
  const { userId, fileId } = job.data;

  if (!fileId) {
    throw new Error('Missing fileId');
  }

  if (!userId) {
    throw new Error('Missing userId');
  }

  // Find the file in DB
  const file = await dbClient.database.collection('files').findOne({ _id: fileId, userId });

  if (!file) {
    throw new Error('File not found');
  }

  if (file.type !== 'image') {
    throw new Error('File is not an image');
  }

  const sizes = [500, 250, 100];
  const originalPath = file.localPath;

  for (const size of sizes) {
    const thumbnailPath = `${originalPath}_${size}`;
    const options = {
      width: size,
      responseType: 'buffer',
    };

    try {
      const thumbnail = await ImageThumbnail(originalPath, options);
      await fs.writeFile(thumbnailPath, thumbnail);
      console.log(`Thumbnail created at size ${size}: ${thumbnailPath}`);
    } catch (err) {
      console.error(`Error creating thumbnail of size ${size}:`, err);
      throw err;
    }
  }

  return Promise.resolve();
});

fileQueue.on('completed', (job) => {
  console.log(`Job ${job.id} completed successfully.`);
});

fileQueue.on('failed', (job, err) => {
  console.error(`Job ${job.id} failed:`, err);
});
