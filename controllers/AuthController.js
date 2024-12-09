import dbClient from '../utils/db.js';
import redisClient from '../utils/redis.js';
import crypto from 'crypto';
import { v4 as uuidv4 } from 'uuid';

class AuthController {
  static async getConnect(req, res) {
    const authHeader = req.headers['authorization'];

    if (!authHeader || !authHeader.startsWith('Basic ')) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    // Decode Base64 credentials
    const base64Credentials = authHeader.split(' ')[1];
    const credentials = Buffer.from(base64Credentials, 'base64').toString('ascii');
    const [email, password] = credentials.split(':');

    if (!email || !password) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    try {
      const user = await dbClient.findUserByEmail(email);
      if (!user) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      // Hash the password using SHA1
      const hashedPassword = crypto.createHash('sha1').update(password).digest('hex');

      if (user.password !== hashedPassword) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      // Generate a token
      const token = uuidv4();

      // Store the token in Redis with expiration of 24 hours (86400 seconds)
      const redisKey = `auth_${token}`;
      await redisClient.set(redisKey, user._id.toString(), 86400);

      // Return the token
      return res.status(200).json({ token });
    } catch (err) {
      console.error('Error in getConnect:', err);
      return res.status(500).json({ error: 'Internal Server Error' });
    }
  }

  static async getDisconnect(req, res) {
    const token = req.headers['x-token'];

    if (!token) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const redisKey = `auth_${token}`;

    try {
      const userId = await redisClient.get(redisKey);
      if (!userId) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      // Delete the token from Redis
      await redisClient.del(redisKey);

      // Return 204 No Content
      return res.status(204).send();
    } catch (err) {
      console.error('Error in getDisconnect:', err);
      return res.status(500).json({ error: 'Internal Server Error' });
    }
  }
}

export default AuthController;
