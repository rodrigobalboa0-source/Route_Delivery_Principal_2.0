import { useEffect } from 'react';
import { LocalNotifications } from '@capacitor/local-notifications';
import { supabase } from '../lib/supabase';

interface NotificationManagerProps {
  userId: string;
  userRole: string;
}

export function NotificationManager({ userId, userRole }: NotificationManagerProps) {
  useEffect(() => {
    if (userRole !== 'entregador') return;

    let channel: any = null;

    const setupNotifications = async () => {
      
      const permStatus = await LocalNotifications.checkPermissions();
      if (permStatus.display !== 'granted') {
        const request = await LocalNotifications.requestPermissions();
        if (request.display !== 'granted') return;
      }

      await LocalNotifications.createChannel({
        id: 'entregas',
        name: 'Novas Entregas',
        description: 'Notificações de novas entregas disponíveis',
        importance: 5,
        visibility: 1,
        sound: 'default.wav', 
        vibration: true,
      });

      channel = supabase
        .channel('notificacoes_entregas')
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'nova_entrega',
          },
          async (payload) => {
            const { eventType, new: newRecord, old: oldRecord } = payload;

            if (
              (eventType === 'INSERT' && newRecord.status === 'disponivel') ||
              (eventType === 'UPDATE' && newRecord.status === 'disponivel' && oldRecord.status !== 'disponivel')
            ) {
              await LocalNotifications.schedule({
                notifications: [{
                  title: 'Nova Entrega Disponível! 🛵',
                  body: `Entrega #${String(newRecord.id).slice(0, 8)} está disponível para aceite.`,
                  id: new Date().getTime(),
                  schedule: { at: new Date(Date.now() + 100) },
                  sound: 'default',
                  channelId: 'entregas',
                  actionTypeId: '',
                  extra: {
                    type: 'nova_disponivel',
                    entregaId: newRecord.id
                  }
                }]
              });
            }

            if (eventType === 'UPDATE') {
              if (
                newRecord.entregador_id === userId &&
                (oldRecord.entregador_id !== userId || oldRecord.status !== newRecord.status) &&
                newRecord.status === 'atribuida'
              ) {
                await LocalNotifications.schedule({
                  notifications: [{
                    title: 'Entrega Atribuída! ✅',
                    body: `Você recebeu uma nova entrega #${String(newRecord.id).slice(0, 8)}.`,
                    id: new Date().getTime(),
                    schedule: { at: new Date(Date.now() + 100) },
                    sound: 'default',
                    channelId: 'entregas',
                    extra: {
                      type: 'atribuida',
                      entregaId: newRecord.id
                    }
                  }]
                });
              }
            }
          }
        )
        .subscribe();
    };

    setupNotifications();

    return () => {
      if (channel) supabase.removeChannel(channel);
    };
  }, [userId, userRole]);

  return null;
}