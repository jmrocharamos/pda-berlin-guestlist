import type { Metadata } from 'next';
import DoorPreview from './preview';
import './preview.css';

export const metadata: Metadata = {
  title: 'PDA — Try the new door flow',
  description: 'A sample guestlist for testing the proposed PDA door workflow.',
  robots: { index: false, follow: false },
};

export default function PreviewPage() { return <DoorPreview />; }
