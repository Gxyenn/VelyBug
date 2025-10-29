import type { VercelRequest, VercelResponse } from '@vercel/node';
import { connectToDatabase } from './lib/mongodb';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method Not Allowed' });
  }

  try {
    const { key } = req.body;
    if (!key) {
      return res.status(400).json({ message: 'Access key is required' });
    }

    const { db } = await connectToDatabase();
    const foundKey = await db.collection('keys').findOne({ value: key });

    if (foundKey) {
      const { _id, ...keyData } = foundKey;
      return res.status(200).json({ id: _id.toHexString(), ...keyData });
    } else {
      return res.status(401).json({ message: 'Invalid Access Key' });
    }
  } catch (error) {
    console.error('Auth API Error:', error);
    const message = error instanceof Error ? error.message : 'Internal Server Error';
    return res.status(500).json({ message });
  }
}
