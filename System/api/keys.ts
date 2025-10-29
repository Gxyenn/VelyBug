
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { connectToDatabase } from './lib/mongodb';
import { ObjectId } from 'mongodb';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const { db } = await connectToDatabase();
  const keysCollection = db.collection('keys');

  try {
    switch (req.method) {
      case 'GET': {
        const keys = await keysCollection.find({}).toArray();
        if (keys.length === 0) {
          // Seed the database with an initial developer key if it's empty
          const initialKey = {
            value: 'Gxyenn969',
            role: 'developer',
            username: 'Gxyenn 正式',
          };
          const result = await keysCollection.insertOne(initialKey);
          const seededKey = { ...initialKey, id: result.insertedId.toHexString() };
          return res.status(200).json([seededKey]);
        }
        const formattedKeys = keys.map(({ _id, ...rest }) => ({ id: _id.toHexString(), ...rest }));
        return res.status(200).json(formattedKeys);
      }
      case 'POST': {
        const newKey = req.body;
        const result = await keysCollection.insertOne(newKey);
        const insertedKey = { id: result.insertedId.toHexString(), ...newKey };
        return res.status(201).json(insertedKey);
      }
      case 'PUT': {
        const { id, ...keyData } = req.body;
        if (!id || typeof id !== 'string') {
          return res.status(400).json({ message: 'A valid key ID is required for update' });
        }
        const result = await keysCollection.updateOne({ _id: new ObjectId(id) }, { $set: keyData });
        if (result.matchedCount === 0) {
          return res.status(404).json({ message: 'Key not found' });
        }
        return res.status(200).json({ id, ...keyData });
      }
      case 'DELETE': {
        const { id } = req.query;
        if (!id || typeof id !== 'string') {
          return res.status(400).json({ message: 'A valid key ID is required' });
        }
        await keysCollection.deleteOne({ _id: new ObjectId(id) });
        return res.status(204).end();
      }
      default:
        res.setHeader('Allow', ['GET', 'POST', 'PUT', 'DELETE']);
        return res.status(405).end(`Method ${req.method} Not Allowed`);
    }
  } catch (error) {
    console.error('Keys API Error:', error);
    const message = error instanceof Error ? error.message : 'Internal Server Error';
    return res.status(500).json({ message });
  }
}