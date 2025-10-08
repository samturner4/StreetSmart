import './globals.css';
import { Inter, Rubik } from 'next/font/google';
import { AuthProvider } from '@/components/auth/AuthProvider';

const inter = Inter({ subsets: ['latin'] });
const rubik = Rubik({ subsets: ['latin'] });

export const metadata = {
  title: 'SafeRoute DC',
  description: 'Navigate DC safely with real-time safety information',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className={`${inter.className} ${rubik.className}`}>
        <AuthProvider>
          {children}
        </AuthProvider>
      </body>
    </html>
  );
}
