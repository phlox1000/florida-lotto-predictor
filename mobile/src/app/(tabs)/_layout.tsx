import { Redirect } from 'expo-router';
import { getToken } from '~/lib/auth';

export default function Layout() {
  const token = getToken();
  if (!token) return <Redirect href="/login" />;
  return <Redirect href="/(tabs)/analyze" />;
}