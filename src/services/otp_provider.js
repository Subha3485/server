import crypto from "crypto";
import { config } from "../config.js";

export async function generateOtpCode() {
  if (config.otpFixedCode) {
    return config.otpFixedCode;
  }

  return String(crypto.randomInt(100000, 1000000));
}

export async function sendOtpCode({ phoneNumber, code }) {
  switch (config.otpProvider) {
    case "mock":
      return {
        provider: "mock",
        delivered: true,
        preview: code
      };
    case "twilio":
      return sendViaTwilio({ phoneNumber, code });
    case "fast2sms":
      return sendViaFast2Sms({ phoneNumber, code });
    case "msg91":
      return sendViaMsg91({ phoneNumber, code });
    default:
      throw new Error(`Unsupported OTP provider: ${config.otpProvider}`);
  }
}

async function sendViaTwilio({ phoneNumber, code }) {
  if (config.twilioVerifyServiceSid) {
    assertConfig(config.twilioAccountSid, "TWILIO_ACCOUNT_SID");
    assertConfig(config.twilioAuthToken, "TWILIO_AUTH_TOKEN");

    const body = new URLSearchParams({
      To: phoneNumber,
      Channel: "sms"
    });

    const response = await fetch(
      `https://verify.twilio.com/v2/Services/${config.twilioVerifyServiceSid}/Verifications`,
      {
        method: "POST",
        headers: {
          Authorization: basicAuth(config.twilioAccountSid, config.twilioAuthToken),
          "Content-Type": "application/x-www-form-urlencoded"
        },
        body
      }
    );

    if (!response.ok) {
      throw new Error(`Twilio Verify failed with status ${response.status}`);
    }

    return { provider: "twilio-verify", delivered: true, preview: null };
  }

  assertConfig(config.twilioAccountSid, "TWILIO_ACCOUNT_SID");
  assertConfig(config.twilioAuthToken, "TWILIO_AUTH_TOKEN");
  assertConfig(config.otpFrom, "OTP_FROM");

  const body = new URLSearchParams({
    To: phoneNumber,
    From: config.otpFrom,
    Body: `Your Bus Logistics OTP is ${code}.`
  });

  const response = await fetch(
    `https://api.twilio.com/2010-04-01/Accounts/${config.twilioAccountSid}/Messages.json`,
    {
      method: "POST",
      headers: {
        Authorization: basicAuth(config.twilioAccountSid, config.twilioAuthToken),
        "Content-Type": "application/x-www-form-urlencoded"
      },
      body
    }
  );

  if (!response.ok) {
    throw new Error(`Twilio SMS failed with status ${response.status}`);
  }

  return { provider: "twilio", delivered: true, preview: null };
}

async function sendViaFast2Sms({ phoneNumber, code }) {
  assertConfig(config.fast2smsApiKey, "FAST2SMS_API_KEY");

  const response = await fetch("https://www.fast2sms.com/dev/bulkV2", {
    method: "POST",
    headers: {
      authorization: config.fast2smsApiKey,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      route: config.fast2smsRoute,
      sender_id: config.otpFrom || "FSTSMS",
      message: `Your Bus Logistics OTP is ${code}`,
      language: "english",
      flash: 0,
      numbers: phoneNumber.replace(/^\+?91/, "")
    })
  });

  if (!response.ok) {
    throw new Error(`Fast2SMS failed with status ${response.status}`);
  }

  return { provider: "fast2sms", delivered: true, preview: null };
}

async function sendViaMsg91({ phoneNumber, code }) {
  assertConfig(config.msg91AuthKey, "MSG91_AUTH_KEY");
  assertConfig(config.msg91TemplateId, "MSG91_TEMPLATE_ID");
  assertConfig(config.msg91SenderId, "MSG91_SENDER_ID");

  const response = await fetch("https://control.msg91.com/api/v5/flow/", {
    method: "POST",
    headers: {
      authkey: config.msg91AuthKey,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      template_id: config.msg91TemplateId,
      sender: config.msg91SenderId,
      short_url: "0",
      mobiles: normalizeMsg91Phone(phoneNumber),
      OTP: code
    })
  });

  if (!response.ok) {
    throw new Error(`MSG91 failed with status ${response.status}`);
  }

  return { provider: "msg91", delivered: true, preview: null };
}

function basicAuth(username, password) {
  return `Basic ${Buffer.from(`${username}:${password}`).toString("base64")}`;
}

function normalizeMsg91Phone(phoneNumber) {
  const digits = phoneNumber.replace(/\D/g, "");
  return digits.startsWith("91") ? digits : `91${digits}`;
}

function assertConfig(value, key) {
  if (!value) {
    throw new Error(`${key} is required for the selected OTP provider.`);
  }
}
