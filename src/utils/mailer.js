import nodemailer from 'nodemailer';

let transporter = null;

/**
 * Initialize email transporter
 */
export const initializeMailer = () => {
  const emailConfig = {
    host: process.env.EMAIL_SMTP_HOST,
    port: parseInt(process.env.EMAIL_SMTP_PORT || '587'),
    secure: false, // true for 465, false for other ports
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS?.replace(/\s/g, ''), // Remove any spaces from password
    },
    tls: {
      rejectUnauthorized: false, // Accept self-signed certificates
    },
  };

  console.log('Initializing mailer with config:', {
    host: emailConfig.host,
    port: emailConfig.port,
    user: emailConfig.auth.user,
    passLength: emailConfig.auth.pass?.length || 0
  });

  transporter = nodemailer.createTransport(emailConfig);
};

/**
 * Send email
 * @param {Object} options - Email options
 * @param {string} options.to - Recipient email
 * @param {string} options.subject - Email subject
 * @param {string} options.text - Plain text body
 * @param {string} options.html - HTML body
 */
export const sendEmail = async ({ to, subject, text, html }) => {
  if (!transporter) {
    console.log('Transporter not initialized, initializing now...');
    initializeMailer();
  }

  try {
    // Verify transporter connection
    await transporter.verify();
    console.log('SMTP connection verified successfully');

    const info = await transporter.sendMail({
      from: `"LocalGuide" <${process.env.EMAIL_USER}>`,
      to,
      subject,
      text,
      html,
    });

    console.log('Email sent successfully: %s', info.messageId);
    return { success: true, messageId: info.messageId };
  } catch (error) {
    console.error('Email sending failed with detailed error:');
    console.error('Error code:', error.code);
    console.error('Error message:', error.message);
    console.error('Error response:', error.response);
    console.error('Full error:', error);
    throw error;
  }
};

/**
 * Send OTP email
 */
export const sendOTPEmail = async (email, otp) => {
  const subject = 'Your LocalGuide Verification Code';
  const text = `Your verification code is: ${otp}. This code will expire in ${process.env.OTP_EXPIRES_MINUTES || 10} minutes.`;
  const html = `
<div style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; max-width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 8px rgba(0,0,0,0.1);">
      <!-- Header -->
      <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 40px 20px; text-align: center;">
        <h2 style="color: #ffffff; margin: 0; font-size: 28px; font-weight: 600;">LocalGuide</h2>
        <p style="color: #f0f0f0; margin: 10px 0 0 0; font-size: 14px;">Email Verification</p>
      </div>
      
      <!-- Body -->
      <div style="padding: 40px 30px;">
        <p style="color: #333; font-size: 16px; line-height: 1.6; margin: 0 0 20px 0;">
          Hello! We received a request to verify your email address. Use the code below to complete your verification:
        </p>
        
        <!-- OTP Code -->
        <div style="background: linear-gradient(135deg, #f5f7fa 0%, #e4e8ec 100%); border: 2px dashed #667eea; border-radius: 8px; padding: 30px; text-align: center; margin: 30px 0;">
          <p style="color: #666; font-size: 12px; margin: 0 0 10px 0; text-transform: uppercase; letter-spacing: 1px; font-weight: 600;">Your Verification Code</p>
          <h1 style="color: #667eea; font-size: 42px; letter-spacing: 8px; margin: 0; font-weight: bold; font-family: 'Courier New', monospace;">${otp}</h1>
        </div>
        
        <!-- Expiry Info -->
        <div style="background-color: #fff3cd; border-left: 4px solid #ffc107; padding: 15px; margin: 20px 0; border-radius: 4px;">
          <p style="color: #856404; margin: 0; font-size: 14px;">
            ⏰ This code will expire in <strong>${process.env.OTP_EXPIRES_MINUTES || 10} minutes</strong>
          </p>
        </div>
        
        <p style="color: #666; font-size: 14px; line-height: 1.6; margin: 20px 0 0 0;">
          If you didn't request this verification code, please ignore this email or contact our support team if you have concerns.
        </p>
      </div>
      
      <!-- Footer -->
      <div style="background-color: #f8f9fa; padding: 20px 30px; border-top: 1px solid #e9ecef; text-align: center;">
        <p style="color: #6c757d; font-size: 12px; margin: 0; line-height: 1.5;">
          This is an automated message from LocalGuide. Please do not reply to this email.
        </p>
        <p style="color: #6c757d; font-size: 12px; margin: 10px 0 0 0;">
          © ${new Date().getFullYear()} LocalGuide. All rights reserved.
        </p>
      </div>
    </div>
  `;

  return await sendEmail({ to: email, subject, text, html });
};

/**
 * Send welcome email
 */
export const sendWelcomeEmail = async (email, name) => {
  const subject = 'Welcome to LocalGuide!';
  const text = `Welcome ${name}! Your email has been verified successfully.`;
  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <h2 style="color: #333;">Welcome to LocalGuide, ${name}!</h2>
      <p>Your email has been verified successfully. You can now enjoy all features of our platform.</p>
      <p>Happy exploring!</p>
    </div>
  `;

  return await sendEmail({ to: email, subject, text, html });
};

/**
 * Send password reset email
 */
export const sendPasswordResetEmail = async (email, resetToken) => {
  const resetUrl = `${process.env.FRONTEND_URL}/reset-password?token=${resetToken}`;
  const subject = 'Password Reset Request';
  const text = `You requested a password reset. Click this link to reset your password: ${resetUrl}`;
  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <h2 style="color: #333;">Password Reset Request</h2>
      <p>You requested a password reset. Click the button below to reset your password:</p>
      <a href="${resetUrl}" style="display: inline-block; background-color: #007bff; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px; margin: 20px 0;">Reset Password</a>
      <p>This link will expire in 1 hour.</p>
      <p>If you didn't request this, please ignore this email.</p>
    </div>
  `;

  return await sendEmail({ to: email, subject, text, html });
};

/**
 * Send admin notification email
 */
export const sendAdminNotification = async (adminEmails, subject, message, htmlContent) => {
  const promises = adminEmails.map((email) =>
    sendEmail({
      to: email,
      subject,
      text: message,
      html: htmlContent || `<p>${message}</p>`,
    })
  );

  return await Promise.allSettled(promises);
};
