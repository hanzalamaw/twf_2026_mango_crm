import nodemailer from "nodemailer";

export const createEmailTransporter = () => {
  const emailUser = process.env.SMTP_USER || process.env.EMAIL_USER;
  const emailPass = process.env.SMTP_PASS || process.env.EMAIL_PASSWORD;

  if (!emailUser || !emailPass) {
    return null;
  }

  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST || "smtp.gmail.com",
    port: parseInt(process.env.SMTP_PORT || "587"),
    secure: false,
    auth: {
      user: emailUser,
      pass: emailPass,
    },
  });
  return transporter;
};

export const sendPasswordEmail = async (email, newPassword) => {
  try {
    const transporter = createEmailTransporter();
    if (!transporter) {
      console.warn("Email not configured. Please set SMTP_USER and SMTP_PASS in .env file");
      return false;
    }
    const mailOptions = {
      from: process.env.SMTP_FROM || process.env.EMAIL_USER || "noreply@twfcattlecrm.com",
      to: email,
      subject: "Your Password - TWF Mango CRM",
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #FF5722;">Password Recovery</h2>
          <p>You requested your password for your TWF Mango CRM account.</p>
          <div style="background-color: #f5f5f5; padding: 20px; border-radius: 5px; margin: 20px 0;">
            <p style="margin: 0; font-size: 14px; color: #666;">Your password is:</p>
            <p style="margin: 10px 0 0 0; font-size: 18px; font-weight: bold; color: #333; letter-spacing: 2px;">${newPassword}</p>
          </div>
          <p style="color: #999; font-size: 12px; margin-top: 30px;">Please keep this password secure and change it after logging in.</p>
          <p style="color: #999; font-size: 12px;">If you didn't request this, please contact support immediately.</p>
        </div>
      `,
      text: `Password Recovery\n\nYour password is: ${newPassword}\n\nPlease keep this password secure and change it after logging in.\n\nIf you didn't request this, please contact support immediately.`
    };
    const info = await transporter.sendMail(mailOptions);
    console.log("Email sent successfully:", info.messageId);
    return true;
  } catch (error) {
    console.error("Error sending email:", error.message);
    return false;
  }
};

export const sendResetLinkEmail = async (email, resetLink) => {
  try {
    const transporter = createEmailTransporter();
    if (!transporter) {
      console.warn("Email not configured. Please set SMTP_USER and SMTP_PASS in .env file");
      return false;
    }
    const mailOptions = {
      from: process.env.SMTP_FROM || process.env.EMAIL_USER || "noreply@twfcattlecrm.com",
      to: email,
      subject: "Reset Your Password - TWF Mango CRM",
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #FF5722;">Reset Your Password</h2>
          <p>You requested to reset your password for your TWF Mango CRM account.</p>
          <p>Click the link below to choose a new password. This link expires in 1 hour.</p>
          <div style="margin: 24px 0;">
            <a href="${resetLink}" style="display: inline-block; background-color: #FF5722; color: #fff; padding: 12px 24px; text-decoration: none; border-radius: 8px; font-weight: 600;">Reset Password</a>
          </div>
          <p style="color: #666; font-size: 12px;">Or copy and paste this link into your browser:</p>
          <p style="color: #333; font-size: 12px; word-break: break-all;">${resetLink}</p>
          <p style="color: #999; font-size: 12px; margin-top: 30px;">If you didn't request this, you can ignore this email. Your password will not be changed.</p>
        </div>
      `,
      text: `Reset Your Password\n\nClick the link below to choose a new password (expires in 1 hour):\n\n${resetLink}\n\nIf you didn't request this, you can ignore this email.`
    };
    const info = await transporter.sendMail(mailOptions);
    console.log("Reset link email sent:", info.messageId);
    return true;
  } catch (error) {
    console.error("Error sending reset link email:", error.message);
    return false;
  }
};

const LOGIN_EMAIL_PRODUCT_NAME = "TWF Mango CRM";

/**
 * Send security alert email when user logs in.
 * Top heading uses APP_NAME (e.g. RGOC ERP); all body text uses TWF Mango CRM.
 * Supports light and dark email client themes via prefers-color-scheme.
 */
export const sendLoginNotificationEmail = async (email, fullName, username, loginTime = new Date()) => {
  try {
    const transporter = createEmailTransporter();
    if (!transporter) {
      console.warn("Email not configured. Please set SMTP_USER and SMTP_PASS in .env file");
      return false;
    }
    const headingName = process.env.APP_NAME || "RGOC ERP";
    const timeStr = loginTime instanceof Date
      ? loginTime.toLocaleString("en-GB", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false })
      : String(loginTime);
    const displayName = (fullName && String(fullName).trim()) || username || "User";

    const mailOptions = {
      from: process.env.SMTP_FROM || process.env.EMAIL_USER || "noreply@twfcattlecrm.com",
      to: email,
      subject: "New Login Detected",
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <meta name="color-scheme" content="light dark">
          <meta name="supported-color-schemes" content="light dark">
          <style type="text/css">
            /* Light UI → show dark email theme */
            @media (prefers-color-scheme: light) {
              .login-email-body { background-color: #4A4A4A !important; color: #eee !important; }
              .login-email-details { background-color: #3A3A3A !important; color: #eee !important; border-left-color: #E34A4A !important; }
              .login-email-footer { color: #999 !important; }
            }
            /* Dark UI → show light email theme */
            @media (prefers-color-scheme: dark) {
              .login-email-body { background-color: #f5f5f5 !important; color: #222 !important; }
              .login-email-details { background-color: #e8e8e8 !important; color: #222 !important; border-left-color: #E34A4A !important; }
              .login-email-footer { color: #555 !important; }
            }
          </style>
        </head>
        <body style="margin: 0; font-family: Arial, sans-serif;">
          <div style="max-width: 600px; margin: 0 auto;">
            <div style="background-color: #E34A4A; color: #fff; padding: 20px; text-align: center;">
              <div style="font-size: 20px; font-weight: bold;">${headingName}</div>
              <div style="font-size: 14px; margin-top: 6px;">Security Alert: New Login Detected</div>
            </div>
            <div class="login-email-body" style="background-color: #f5f5f5; color: #222; padding: 24px;">
              <p style="margin: 0 0 16px 0; font-size: 15px;"><strong>Hello ${displayName},</strong></p>
              <p style="margin: 0 0 20px 0; font-size: 14px; line-height: 1.5;">A new login was detected on your ${LOGIN_EMAIL_PRODUCT_NAME} account.</p>
              <div class="login-email-details" style="background-color: #e8e8e8; border-left: 4px solid #E34A4A; padding: 16px; margin: 16px 0;">
                <div style="font-weight: bold; margin-bottom: 10px; font-size: 14px;">Login Details:</div>
                <ul style="margin: 0; padding-left: 20px; font-size: 14px; line-height: 1.8;">
                  <li>Time: ${timeStr}</li>
                  <li>Username: ${username || '—'}</li>
                </ul>
              </div>
              <p style="margin: 20px 0 0 0; font-size: 14px; line-height: 1.5;">If this login was <strong>not</strong> done by you, please contact the system administrator immediately so your account can be secured.</p>
              <p class="login-email-footer" style="margin: 24px 0 0 0; font-size: 12px; color: #555;">— This is an automated security email from ${LOGIN_EMAIL_PRODUCT_NAME}</p>
            </div>
          </div>
        </body>
        </html>
      `,
      text: `${headingName} – Security Alert: New Login Detected\n\nHello ${displayName},\n\nA new login was detected on your ${LOGIN_EMAIL_PRODUCT_NAME} account.\n\nLogin Details:\n• Time: ${timeStr}\n• Username: ${username || '—'}\n\nIf this login was not done by you, please contact the system administrator immediately so your account can be secured.\n\n— This is an automated security email from ${LOGIN_EMAIL_PRODUCT_NAME}`
    };
    const info = await transporter.sendMail(mailOptions);
    console.log("Login notification email sent:", info.messageId);
    return true;
  } catch (error) {
    console.error("Error sending login notification email:", error.message);
    return false;
  }
};
