import { useEffect } from 'react';
import { LocalNotifications } from '@capacitor/local-notifications';
import { PushNotifications } from '@capacitor/push-notifications';
import { Capacitor } from '@capacitor/core';
import { Geolocation } from '@capacitor/geolocation';
import { supabase } from '../lib/supabase';
import { getCoordsFromAddress, getDistanceFromLatLonInKm } from '../utils/geo';

interface NotificationManagerProps {
  userId: string;
  userRole: string;
}

export function NotificationManager({ userId, userRole }: NotificationManagerProps) {
  useEffect(() => {
    if (userRole !== 'entregador') return;

    let channel: any = null;

    const setupNotifications = async () => {
      // Fetch radius config
      let radiusKm = 10; // default
      try {
        const { data: config } = await supabase.from('configuracoes_comercio').select('raio_busca_entregador').single();
        if (config?.raio_busca_entregador) {
          radiusKm = config.raio_busca_entregador;
        }
      } catch (e) {
        console.error('Erro ao buscar config raio:', e);
      }
      
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

          PushNotifications.removeAllListeners();

          PushNotifications.addListener('registration', async (token) => {
            console.log('Push Registration Token:', token.value);
            
            try {
              const { data: { user } } = await supabase.auth.getUser();
              if (user?.email) {
                const { error } = await supabase
                  .from('entregadores')
                  .update({ fcm_token: token.value })
                  .eq('email', user.email);
                
                if (error) console.error('Erro ao atualizar token FCM:', error);
                else console.log('Token FCM salvo com sucesso');
              }
            } catch (err) {
              console.error('Erro ao salvar token FCM:', err);
            }
          });

          PushNotifications.addListener('registrationError', error => {
            console.error('Error on registration:', error);
          });

          PushNotifications.addListener('pushNotificationReceived', notification => {
            console.log('Push Received:', notification);
          });

          PushNotifications.addListener('pushNotificationActionPerformed', notification => {
            console.log('Push Action:', notification);
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
              // Verificar raio
              try {
                if (newRecord.coleta_endereco_texto) {
                   const pickupCoords = await getCoordsFromAddress(newRecord.coleta_endereco_texto);
                   if (pickupCoords) {
                      const pos = await Geolocation.getCurrentPosition({ enableHighAccuracy: false, timeout: 5000 });
                      if (pos) {
                          const dist = getDistanceFromLatLonInKm(
                              pos.coords.latitude, pos.coords.longitude,
                              pickupCoords[0], pickupCoords[1]
                          );
                          if (dist > radiusKm) {
                              console.log(`Ignorando notificação: Distância ${dist.toFixed(1)}km > Raio ${radiusKm}km`);
                              return;
                          }
                      }
                   }
                }
              } catch (e) {
                console.error('Erro ao verificar raio para notificação:', e);
              }

              if (onNavigate) {
                  onNavigate('home_entregador');
              }

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

                if (onNavigate) {
                    onNavigate('home_entregador');
                }
              }
          }
        )
        .on(
          'postgres_changes',
          {
            event: 'INSERT',
            schema: 'public',
            table: 'entregador_notificacoes',
            filter: `entregador_id=eq.${userId}`
          },
          async (payload) => {
            const newRecord = payload.new;
            await LocalNotifications.schedule({
              notifications: [{
                title: newRecord.titulo || 'Nova Notificação',
                body: newRecord.mensagem || 'Você tem uma nova mensagem.',
                id: new Date().getTime(),
                schedule: { at: new Date(Date.now() + 100) },
                sound: 'default',
                channelId: 'entregas',
                extra: {
                  type: 'sistema',
                  notificacaoId: newRecord.id
                }
              }]
            });
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