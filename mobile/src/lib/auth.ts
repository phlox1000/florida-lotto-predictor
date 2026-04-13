import * as SecureStore from 'expo-secure-store';
import { router } from 'expo-router';
import { trpc } from './trpc';

export const login = async (email: string, password: string) => {
  const { token } = await trpc.auth.login.mutate({ email, password });
  await SecureStore.setItemAsync('token', token);
  router.replace('/(tabs)/analyze');
};

export const logout = async () => {
  await SecureStore.deleteItemAsync('token');
  router.replace('/login');
};

export const getToken = async () => {
  return await SecureStore.getItemAsync('token');
};