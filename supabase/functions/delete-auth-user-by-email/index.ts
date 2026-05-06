import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabaseClient = createClient(
      
      Deno.env.get('SUPABASE_URL') ?? '',
      
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      {
        auth: {
            autoRefreshToken: false,
            persistSession: false
        }
      }
    )

    const { email } = await req.json()

    if (!email) {
      throw new Error('Email is required')
    }

    console.log(`Attempting to delete user with email: ${email}`)

    const { data: { users }, error: listError } = await supabaseClient.auth.admin.listUsers({
        perPage: 1000 
    })
    
    if (listError) {
        throw listError
    }

    const user = users.find(u => u.email?.toLowerCase() === email.toLowerCase())

    if (!user) {
        console.log('User not found in Auth system (already deleted?)')
        return new Response(
            JSON.stringify({ message: 'User not found (already deleted?)' }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
        )
    }

    const { error: deleteError } = await supabaseClient.auth.admin.deleteUser(user.id)

    if (deleteError) {
        throw deleteError
    }

    console.log(`User ${user.id} (${email}) deleted successfully from Auth.`)

    return new Response(
      JSON.stringify({ message: 'User deleted successfully' }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
    )

  } catch (error) {
    console.error('Error:', error)
    return new Response(
      JSON.stringify({ error: error.message }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
    )
  }
})