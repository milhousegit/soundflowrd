import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { autoRefreshToken: false, persistSession: false }
    });

    const { referralCode, newUserId } = await req.json();
    
    if (!referralCode || !newUserId) {
      return new Response(JSON.stringify({ error: 'Missing referralCode or newUserId' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Find the referrer by referral code
    const { data: referrer, error: referrerError } = await supabaseAdmin
      .from('profiles')
      .select('id, is_premium, premium_expires_at')
      .eq('referral_code', referralCode.toUpperCase())
      .single();

    if (referrerError || !referrer) {
      return new Response(JSON.stringify({ error: 'Invalid referral code' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Prevent self-referral
    if (referrer.id === newUserId) {
      return new Response(JSON.stringify({ error: 'Cannot use your own referral code' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Check if this user was already referred
    const { data: existingReferral } = await supabaseAdmin
      .from('referrals')
      .select('id')
      .eq('referred_id', newUserId)
      .single();

    if (existingReferral) {
      return new Response(JSON.stringify({ error: 'User already has a referral' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Calculate premium dates
    const now = new Date();
    const oneMonthFromNow = new Date(now);
    oneMonthFromNow.setMonth(oneMonthFromNow.getMonth() + 1);

    // Calculate referrer's new premium expiry
    let referrerNewExpiry: Date;
    if (referrer.is_premium && referrer.premium_expires_at) {
      const currentExpiry = new Date(referrer.premium_expires_at);
      if (currentExpiry > now) {
        // Extend existing premium by 1 month
        referrerNewExpiry = new Date(currentExpiry);
        referrerNewExpiry.setMonth(referrerNewExpiry.getMonth() + 1);
      } else {
        // Premium expired, start fresh
        referrerNewExpiry = oneMonthFromNow;
      }
    } else {
      // No premium, grant 1 month
      referrerNewExpiry = oneMonthFromNow;
    }

    // Update referred user with premium and link to referrer
    const { error: updateReferredError } = await supabaseAdmin
      .from('profiles')
      .update({
        is_premium: true,
        premium_expires_at: oneMonthFromNow.toISOString(),
        referred_by: referrer.id,
      })
      .eq('id', newUserId);

    if (updateReferredError) {
      console.error('Error updating referred user:', updateReferredError);
      throw updateReferredError;
    }

    // Update referrer with extended premium
    const { error: updateReferrerError } = await supabaseAdmin
      .from('profiles')
      .update({
        is_premium: true,
        premium_expires_at: referrerNewExpiry.toISOString(),
      })
      .eq('id', referrer.id);

    if (updateReferrerError) {
      console.error('Error updating referrer:', updateReferrerError);
      throw updateReferrerError;
    }

    // Create referral record
    const { error: referralError } = await supabaseAdmin
      .from('referrals')
      .insert({
        referrer_id: referrer.id,
        referred_id: newUserId,
        referrer_premium_granted: true,
        referred_premium_granted: true,
      });

    if (referralError) {
      console.error('Error creating referral record:', referralError);
      // Don't fail the whole operation for this
    }

    return new Response(JSON.stringify({ 
      success: true,
      message: 'Referral processed successfully',
      referrerPremiumExpiry: referrerNewExpiry.toISOString(),
      referredPremiumExpiry: oneMonthFromNow.toISOString(),
    }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Error in process-referral function:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
