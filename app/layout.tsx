import './globals.css';
import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import MenuNavegacion from './MenuNavegacion';

const inter = Inter({
  subsets: ['latin'],
});

export const metadata: Metadata = {
  title: 'MORAS POS',
  description: 'Sistema de punto de venta MORAS',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="es">
      <body
        className={inter.className}
        style={{
          margin: 0,
        }}
      >
        <div
          style={{
            paddingBottom: '85px',
          }}
        >
          {children}
        </div>

        <MenuNavegacion />
      </body>
    </html>
  );
}