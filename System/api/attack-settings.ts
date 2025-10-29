import type { VercelRequest, VercelResponse } from '@vercel/node';
import { connectToDatabase } from './lib/mongodb';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const { db } = await connectToDatabase();

  if (req.method === 'GET') {
    const config = await db.collection('config').findOne({});
    res.status(200).json({ max_duration: config?.max_duration });
  } else if (req.method === 'POST') {
    const { max_duration } = req.body;

    if (typeof max_duration !== 'number' || max_duration <= 0) {
      return res.status(400).json({ message: 'max_duration must be a positive number' });
    }

    await db.collection('config').updateOne({}, { $set: { max_duration } }, { upsert: true });

    res.status(200).json({ message: 'Settings saved successfully' });
  } else {
    res.status(405).end('Method Not Allowed');
  }
}