import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { Resend } from "https://esm.sh/resend@2.0.0";

const resend = new Resend(Deno.env.get("RESEND_API_KEY"));

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface EmailRequest {
  email: string;
  confirmationUrl: string;
  fullName?: string;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { email, confirmationUrl, fullName }: EmailRequest = await req.json();

    const emailHtml = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
        <h1 style="color: #333; border-bottom: 2px solid #4CAF50; padding-bottom: 10px;">Welcome to EU Wristbands! 🎉</h1>
        
        <p>Dear ${fullName || 'Customer'},</p>
        
        <p>Thank you for signing up! Please confirm your email address to complete your registration and start designing custom wristbands.</p>
        
        <div style="text-align: center; margin: 30px 0;">
          <a href="${confirmationUrl}" 
             style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); 
                    color: white; 
                    padding: 15px 30px; 
                    text-decoration: none; 
                    border-radius: 8px; 
                    display: inline-block;
                    font-weight: bold;">
            Verify Email Address
          </a>
        </div>
        
        <p style="color: #666; font-size: 14px;">If the button doesn't work, copy and paste this link into your browser:</p>
        <p style="background: #f5f5f5; padding: 10px; border-radius: 5px; word-break: break-all; font-size: 12px;">
          ${confirmationUrl}
        </p>
        
        <p style="margin-top: 30px;">Once verified, you'll be able to:</p>
        <ul style="color: #555;">
          <li>Design custom wristbands</li>
          <li>Place orders</li>
          <li>Track your orders</li>
          <li>Save your designs</li>
        </ul>
        
        <p style="margin-top: 30px;">Best regards,<br><strong>EU Wristbands Team</strong></p>
        
        <div style="margin-top: 40px; padding-top: 20px; border-top: 1px solid #ddd; text-align: center; color: #888; font-size: 12px;">
          <p>This is an automated email. Please do not reply directly to this message.</p>
          <p>If you didn't sign up for EU Wristbands, you can safely ignore this email.</p>
        </div>
      </div>
    `;

    const { error: emailError } = await resend.emails.send({
      from: "EU Wristbands <onboarding@resend.dev>",
      to: [email],
      subject: "Verify Your Email - EU Wristbands",
      html: emailHtml,
    });

    if (emailError) {
      console.error("Email sending error:", emailError);
      throw emailError;
    }

    console.log(`Verification email sent to ${email}`);

    return new Response(
      JSON.stringify({ success: true, message: "Verification email sent successfully" }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      }
    );
  } catch (error: any) {
    console.error("Error sending verification email:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 500,
      }
    );
  }
});
