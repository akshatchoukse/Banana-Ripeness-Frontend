import './globals.css';

export const metadata = {
  title: 'Banana Ripeness Major Project',
  description: 'Color Recognition using Neural Networks to Determine the Ripeness of Banana',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
