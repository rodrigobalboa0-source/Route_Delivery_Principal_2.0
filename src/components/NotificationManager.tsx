import { useEffect } from 'react';
import { LocalNotifications } from '@capacitor/local-notifications';
import { PushNotifications } from '@capacitor/push-notifications';
import { Capacitor } from '@capacitor/core';
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
      // Configuração de Notificações Locais
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

      // Configuração de Push Notifications (Firebase)
      if (Capacitor.isNativePlatform()) {
        try {
          const pushPermStatus = await PushNotifications.checkPermissions();
          if (pushPermStatus.receive !== 'granted') {
            const request = await PushNotifications.requestPermissions();
            if (request.receive === 'granted') {
              await PushNotifications.register();
            }
          } else {
            await PushNotifications.register();
          }

          PushNotifications.addListener('registration', token => {
            console.log('Push Registration Token:', token.value);
            // TODO: Salvar token no perfil do entregador no Supabase para envio via Edge Function
          });

          PushNotifications.addListener('registrationError', error => {
            console.error('Error on registration:', error);
          });

          PushNotifications.addListener('pushNotificationReceived', notification => {
            console.log('Push Received:', notification);
            // Se o app estiver aberto, podemos mostrar um toast ou deixar a notificação nativa aparecer
          });

          PushNotifications.addListener('pushNotificationActionPerformed', notification => {
            console.log('Push Action:', notification);
            // Navegar para a tela de pedidos
          });
        } catch (e) {
          console.error('Erro ao configurar Push Notifications:', e);
        }
      }

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
              (eventType === 'INSERT' && newRecord.status === 'criada' && !newRecord.entregador_id) ||
              (eventType === 'UPDATE' && newRecord.status === 'criada' && !newRecord.entregador_id && (oldRecord.status !== 'criada' || oldRecord.entregador_id))
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

            if (
              (eventType === 'INSERT' && (newRecord.status === 'atribuida' || newRecord.status === 'criada') && newRecord.entregador_id === userId) ||
              (eventType === 'UPDATE' && (newRecord.status === 'atribuida' || newRecord.status === 'criada') && newRecord.entregador_id === userId && 
               (oldRecord.entregador_id !== userId || (oldRecord.status !== 'atribuida' && oldRecord.status !== 'criada')))
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