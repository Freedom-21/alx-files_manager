import dbClient from '../utils/db.js';
import redisClient from '../utils/redis.js';
import { v4 as uuidv4 } from 'uuid';
import path from 'path';
import fs from 'fs';
import mime from 'mime-types';
import Bull from 'bull';
import ImageThumbnail from 'image-thumbnail';

// Initialize Bull Queue
const fileQueue = new Bull('fileQueue', {
  redis: {
    host: process.env.REDIS_HOST || '127.0.0.1',
    port: process.env.REDIS_PORT || 6379,
  },
});

class FilesController {
  static async postUpload(req, res) {
    const token = req.headers['x-token'];

    if (!token) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const redisKey = `auth_${token}`;
    const userId = await redisClient.get(redisKey);

    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { name, type, parentId = '0', isPublic = false, data } = req.body;

    // Validate name
    if (!name) {
      return res.status(400).json({ error: 'Missing name' });
    }

    // Validate type
    const allowedTypes = ['folder', 'file', 'image'];
    if (!type || !allowedTypes.includes(type)) {
      return res.status(400).json({ error: 'Missing type' });
    }

    // Validate data
    if (type !== 'folder' && !data) {
      return res.status(400).json({ error: 'Missing data' });
    }

    try {
      // If parentId is set, validate it
      if (parentId !== '0') {
        const parentFile = await dbClient.database.collection('files').findOne({ _id: parentId, userId });
        if (!parentFile) {
          return res.status(400).json({ error: 'Parent not found' });
        }
        if (parentFile.type !== 'folder') {
          return res.status(400).json({ error: 'Parent is not a folder' });
        }
      }

      const newFile = {
        userId,
        name,
        type,
        isPublic,
        parentId,
      };

      if (type === 'folder') {
        // Insert folder into DB
        const result = await dbClient.database.collection('files').insertOne(newFile);
        const file = result.ops[0];
        file.id = file._id.toString();
        delete file._id;
        return res.status(201).json(file);
      } else {
        // Handle file or image
        const folderPath = process.env.FOLDER_PATH || '/tmp/files_manager';
        if (!fs.existsSync(folderPath)) {
          fs.mkdirSync(folderPath, { recursive: true });
        }

        const localFilename = uuidv4();
        const localPath = path.join(folderPath, localFilename);

        // Decode Base64 data and write to file
        const fileBuffer = Buffer.from(data, 'base64');
        fs.writeFileSync(localPath, fileBuffer);

        newFile.localPath = localPath;

        // Insert file into DB
        const result = await dbClient.database.collection('files').insertOne(newFile);
        const file = result.ops[0];
        file.id = file._id.toString();
        delete file._id;

        // If the file is an image, add a job to the queue
        if (type === 'image') {
          await fileQueue.add({ userId, fileId: file._id.toString() });
        }

        return res.status(201).json(file);
      }
    } catch (err) {
      console.error('Error in postUpload:', err);
      return res.status(500).json({ error: 'Internal Server Error' });
    }
  }

  static async getShow(req, res) {
    const token = req.headers['x-token'];

    if (!token) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const redisKey = `auth_${token}`;
    const userId = await redisClient.get(redisKey);

    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const fileId = req.params.id;

    try {
      const file = await dbClient.database.collection('files').findOne({ _id: fileId, userId });

      if (!file) {
        return res.status(404).json({ error: 'Not found' });
      }

      // Modify file object for response
      const responseFile = { ...file };
      responseFile.id = file._id.toString();
      delete responseFile._id;

      return res.status(200).json(responseFile);
    } catch (err) {
      console.error('Error in getShow:', err);
      return res.status(500).json({ error: 'Internal Server Error' });
    }
  }

  static async getIndex(req, res) {
    const token = req.headers['x-token'];
    const page = parseInt(req.query.page, 10) || 0;
    const parentId = req.query.parentId || '0';

    if (!token) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const redisKey = `auth_${token}`;
    const userId = await redisClient.get(redisKey);

    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const limit = 20;
    const skip = page * limit;

    try {
      const files = await dbClient.database
        .collection('files')
        .find({ userId, parentId })
        .skip(skip)
        .limit(limit)
        .toArray();

      const responseFiles = files.map((file) => {
        const obj = { ...file };
        obj.id = file._id.toString();
        delete obj._id;
        return obj;
      });

      return res.status(200).json(responseFiles);
    } catch (err) {
      console.error('Error in getIndex:', err);
      return res.status(500).json({ error: 'Internal Server Error' });
    }
  }

  static async putPublish(req, res) {
    const token = req.headers['x-token'];
    const fileId = req.params.id;

    if (!token) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const redisKey = `auth_${token}`;
    const userId = await redisClient.get(redisKey);

    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    try {
      const file = await dbClient.database.collection('files').findOne({ _id: fileId, userId });

      if (!file) {
        return res.status(404).json({ error: 'Not found' });
      }

      // Update isPublic to true
      await dbClient.database.collection('files').updateOne(
        { _id: fileId },
        { $set: { isPublic: true } }
      );

      // Retrieve updated file
      const updatedFile = await dbClient.database.collection('files').findOne({ _id: fileId });

      const responseFile = { ...updatedFile };
      responseFile.id = updatedFile._id.toString();
      delete responseFile._id;

      return res.status(200).json(responseFile);
    } catch (err) {
      console.error('Error in putPublish:', err);
      return res.status(500).json({ error: 'Internal Server Error' });
    }
  }

  static async putUnpublish(req, res) {
    const token = req.headers['x-token'];
    const fileId = req.params.id;

    if (!token) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const redisKey = `auth_${token}`;
    const userId = await redisClient.get(redisKey);

    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    try {
      const file = await dbClient.database.collection('files').findOne({ _id: fileId, userId });

      if (!file) {
        return res.status(404).json({ error: 'Not found' });
      }

      // Update isPublic to false
      await dbClient.database.collection('files').updateOne(
        { _id: fileId },
        { $set: { isPublic: false } }
      );

      // Retrieve updated file
      const updatedFile = await dbClient.database.collection('files').findOne({ _id: fileId });

      const responseFile = { ...updatedFile };
      responseFile.id = updatedFile._id.toString();
      delete responseFile._id;

      return res.status(200).json(responseFile);
    } catch (err) {
      console.error('Error in putUnpublish:', err);
      return res.status(500).json({ error: 'Internal Server Error' });
    }
  }

  static async getFile(req, res) {
    const token = req.headers['x-token'];
    const fileId = req.params.id;
    const size = req.query.size;

    let userId = null;

    if (token) {
      const redisKey = `auth_${token}`;
      userId = await redisClient.get(redisKey);
    }

    try {
      const file = await dbClient.database.collection('files').findOne({ _id: fileId });

      if (!file) {
        return res.status(404).json({ error: 'Not found' });
      }

      // Check permissions
      if (!file.isPublic) {
        if (!userId || file.userId !== userId) {
          return res.status(404).json({ error: 'Not found' });
        }
      }

      if (file.type === 'folder') {
        return res.status(400).json({ error: "A folder doesn't have content" });
      }

      // Determine the file path
      let filePath = file.localPath;

      if (size) {
        if (!['100', '250', '500'].includes(size)) {
          return res.status(400).json({ error: 'Invalid size parameter' });
        }
        filePath = `${file.localPath}_${size}`;
      }

      // Check if the file exists
      if (!fs.existsSync(filePath)) {
        return res.status(404).json({ error: 'Not found' });
      }

      // Determine MIME type
      const mimeType = mime.lookup(file.name) || 'application/octet-stream';

      // Read the file
      const fileContent = fs.readFileSync(filePath);

      res.setHeader('Content-Type', mimeType);
      return res.status(200).send(fileContent);
    } catch (err) {
      console.error('Error in getFile:', err);
      return res.status(500).json({ error: 'Internal Server Error' });
    }
  }
}

export default FilesController;
