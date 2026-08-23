declare module "worker-loader!*" {
  class WebpackWorker extends Worker {
    constructor();
  }
  export default WebpackWorker;
}

declare module "worker-loader!../../assets/lib/rspow.worker.js" {
  class RspowWorker extends Worker {
    constructor();
  }
  export default RspowWorker;
}

declare module "*/nanoidenticons.min.js" {
  export function createIcon(options: { seed: string; scale: number }): HTMLCanvasElement;
}
