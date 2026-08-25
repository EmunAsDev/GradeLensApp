import { apiRequest } from "../../src/api/client";

type RegisterDeviceResponse = {
  message: string;

  device: {
    device_id: number;
    device_uuid: string;
  };
};

export async function registerDevice(
  token: string,
  deviceUuid: string,
  publicKey: string,
): Promise<RegisterDeviceResponse> {
  return apiRequest<RegisterDeviceResponse>("/devices/register", {
    method: "POST",

    token,

    body: JSON.stringify({
      device_uuid: deviceUuid,

      public_key: publicKey,
    }),
  });
}
