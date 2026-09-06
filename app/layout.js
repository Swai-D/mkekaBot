import './globals.css';

export const metadata = {
  title: 'MkekaBOT v3.5',
  description: 'Yellow Cards Betting Intelligence',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
