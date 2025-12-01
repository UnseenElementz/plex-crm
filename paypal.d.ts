declare module '@paypal/checkout-server-sdk' {
  export namespace core {
    class PayPalHttpClient {
      constructor(environment: any)
      execute(request: any): Promise<any>
    }
    class LiveEnvironment {
      constructor(clientId: string, clientSecret: string)
    }
    class SandboxEnvironment {
      constructor(clientId: string, clientSecret: string)
    }
  }
  
  export namespace orders {
    class OrdersCreateRequest {
      constructor()
      prefer(value: string): void
      requestBody(body: any): void
    }
    class OrdersCaptureRequest {
      constructor(orderId: string)
      requestBody(body?: any): void
    }
  }
}