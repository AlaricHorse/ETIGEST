import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'ETI Gestão Escolar | Escola Técnica Império',
  description: 'Sistema Integrado de Gestão Escolar, Frequência, Relatórios e Backups Automáticos da Escola Técnica Império (ETI).',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="pt-BR">
      <body className="min-h-screen bg-white text-slate-900 antialiased">
        {children}
      </body>
    </html>
  );
}
