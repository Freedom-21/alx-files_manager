import { MongoClient, ObjectId } from 'mongodb';
import dotenv from 'dotenv';

// Load environment variables from .env file
dotenv.config();

class DBClient {
  constructor() {
    const host = process.env.DB_HOST || 'localhost';
    const port = process.env.DB_PORT || '27017';
    const database = process.env.DB_DATABASE || 'files_manager';

    const uri = `mongodb://${host}:${port}`;
    this.client = new MongoClient(uri, { useUnifiedTopology: true });
    this.database = null;

    this.client.connect()
      .then(() => {
        this.database = this.client.db(database);
        console.log('Connected to MongoDB');
      })
      .catch((err) => {
        console.error('MongoDB Connection Error:', err);
      });
  }

  isAlive() {
    return this.client && this.client.isConnected();
  }

  async nbUsers() {
    try {
      const usersCollection = this.database.collection('users');
      const count = await usersCollection.countDocuments();
      return count;
    } catch (err) {
      console.error('MongoDB nbUsers Error:', err);
      return 0;
    }
  }

  async nbFiles() {
    try {
      const filesCollection = this.database.collection('files');
      const count = await filesCollection.countDocuments();
      return count;
    } catch (err) {
      console.error('MongoDB nbFiles Error:', err);
      return 0;
    }
  }

  async findUserByEmail(email) {
    try {
      const usersCollection = this.database.collection('users');
      const user = await usersCollection.findOne({ email });
      return user;
    } catch (err) {
      console.error('MongoDB findUserByEmail Error:', err);
      return null;
    }
  }

  async findUserById(id) {
    try {
      const usersCollection = this.database.collection('users');
      const user = await usersCollection.findOne({ _id: new ObjectId(id) });
      return user;
    } catch (err) {
      console.error('MongoDB findUserById Error:', err);
      return null;
    }
  }

  async createUser(user) {
    try {
      const usersCollection = this.database.collection('users');
      const result = await usersCollection.insertOne(user);
      return result.ops[0];
    } catch (err) {
      console.error('MongoDB createUser Error:', err);
      return null;
    }
  }

  async findFileById(id) {
    try {
      const filesCollection = this.database.collection('files');
      const file = await filesCollection.findOne({ _id: id });
      return file;
    } catch (err) {
      console.error('MongoDB findFileById Error:', err);
      return null;
    }
  }

  async findFilesByParentId(userId, parentId, page, limit) {
    try {
      const filesCollection = this.database.collection('files');
      const files = await filesCollection.find({ userId, parentId })
        .skip(page * limit)
        .limit(limit)
        .toArray();
      return files;
    } catch (err) {
      console.error('MongoDB findFilesByParentId Error:', err);
      return [];
    }
  }

  async updateFile(fileId, updateFields) {
    try {
      const filesCollection = this.database.collection('files');
      await filesCollection.updateOne(
        { _id: fileId },
        { $set: updateFields }
      );
      const updatedFile = await filesCollection.findOne({ _id: fileId });
      return updatedFile;
    } catch (err) {
      console.error('MongoDB updateFile Error:', err);
      return null;
    }
  }
}

const dbClient = new DBClient();

export default dbClient;
