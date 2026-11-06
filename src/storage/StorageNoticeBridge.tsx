import { useEffect } from 'react';
import { useToast } from '../components/ui/Toast';
import { subscribeStorageNotices } from './storageNotices';

export function StorageNoticeBridge() {
  const toast = useToast();

  useEffect(() => subscribeStorageNotices(({ level, title, description }) => {
    toast[level]({ title, description });
  }), [toast]);

  return null;
}
