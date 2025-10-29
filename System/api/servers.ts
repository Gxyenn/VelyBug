import type { VercelRequest, VercelResponse } from '@vercel/node';
import { connectToDatabase } from './lib/mongodb';
import { ObjectId } from 'mongodb';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const { db } = await connectToDatabase();
  const serversCollection = db.collection('servers');

  try {
    switch (req.method) {
      case 'GET': {
        const servers = await serversCollection.find({}).toArray();
        const formattedServers = servers.map(({ _id, ...rest }) => ({ id: _id.toHexString(), ...rest }));
        return res.status(200).json(formattedServers);
      }
      case 'POST': {
        const newServer = req.body;
        const result = await serversCollection.insertOne(newServer);
        const insertedServer = { id: result.insertedId.toHexString(), ...newServer };
        return res.status(201).json(insertedServer);
      }
      case 'DELETE': {
        const { id } = req.query;
         if (!id || typeof id !== 'string') {
          return res.status(400).json({ message: 'A valid server ID is required' });
        }
        await serversCollection.deleteOne({ _id: new ObjectId(id) });
        return res.status(204).end();
      }
      default:
        res.setHeader('Allow', ['GET', 'POST', 'DELETE']);
        return res.status(405).end(`Method ${req.method} Not Allowed`);
    }
  } catch (error) {
    console.error('Servers API Error:', error);
    const message = error instanceof Error ? error.message : 'Internal Server Error';
    return res.status(500).json({ message });
  }
}
