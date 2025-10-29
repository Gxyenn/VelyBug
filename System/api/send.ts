import type { VercelRequest, VercelResponse } from '@vercel/node';
import axios from 'axios';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).end('Method Not Allowed');
  }

  const { key, target, mode, duration } = req.body;

  if (!key || !target || !mode) {
    return res.status(400).json({ message: 'Missing required parameters: key, target, mode' });
  }

  try {
    const layananUrl = process.env.LAYANAN_URL;
    if (!layananUrl) {
      throw new Error('LAYANAN_URL environment variable is not set');
    }

    const response = await axios.post(`${layananUrl}/api/send`, {
      key,
      target,
      mode,
      duration,
    });

    res.status(response.status).json(response.data);
  } catch (error) {
    if (axios.isAxiosError(error) && error.response) {
      res.status(error.response.status).json(error.response.data);
    } else {
      const message = error instanceof Error ? error.message : 'Internal Server Error';
      res.status(500).json({ message });
    }
  }
}
