import { redirect } from 'next/navigation';

// Root page — seedha /projects par redirect kar do
// Kyunki hamara main dashboard projects list page hai
export default function Home() {
  redirect('/projects');
}
