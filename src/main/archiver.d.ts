declare module 'archiver' {
  interface ArchiverInstance {
    pipe(destination: NodeJS.WritableStream): void;
    append(source: string | Buffer, data: { name: string }): void;
    finalize(): Promise<void>;
  }

  interface ArchiverOptions {
    zlib?: {
      level?: number;
    };
  }

  export default function archiver(format: 'zip', options?: ArchiverOptions): ArchiverInstance;
}
