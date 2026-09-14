import type {Metadata} from 'next';
import './globals.css'; 

export const metadata: Metadata = {
  title: 'Domain Masker',
  description: 'Client-side tool to pseudonymize and restore domains in texts and files with custom target masks and NOT MASK URL whitelisting.',
};

export default function RootLayout({children}: {children: React.ReactNode}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
