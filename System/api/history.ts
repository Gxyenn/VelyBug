import type { VercelRequest, VercelResponse } from '@vercel/node';
import { connectToDatabase } from './lib/mongodb';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const { db } = await connectToDatabase();
  const historyCollection = db.collection('history');

  try {
    switch (req.method) {
      case 'GET': {
        const history = await historyCollection.find({}).sort({ timestamp: -1 }).toArray();
        const formattedHistory = history.map(({ _id, ...rest }) => ({ id: _id.toHexString(), ...rest }));
        return res.status(200).json(formattedHistory);
      }
      case 'POST': {
        const newLog = { ...req.body, timestamp: new Date(req.body.timestamp) };
        const result = await historyCollection.insertOne(newLog);
        const insertedLog = { id: result.insertedId.toHexString(), ...newLog };
        return res.status(201).json(insertedLog);
      }
      case 'DELETE': { // For clearing the history
        await historyCollection.deleteMany({});
        return res.status(204).end();
      }
      default:
        res.setHeader('Allow', ['GET', 'POST', 'DELETE']);
        return res.status(405).end(`Method ${req.method} Not Allowed`);
    }
  } catch (error) {
    console.error('History API Error:', error);
    const message = error instanceof Error ? error.message : 'Internal Server Error';
    return res.status(500).json({ message });
  }
}
