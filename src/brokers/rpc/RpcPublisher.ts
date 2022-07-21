import { Broker } from "../Broker";
import { CordisBrokerError } from "../../error";
import { Channel } from "amqplib";

/**
 * Options for initializing the RPC client
 */
export interface RpcPublisherInitOptions {
    /**
     * Queue the server should be recieving requests on
     */
    name: string;
    /**
     * How long to wait before dropping a packet
     */
    timeout?: number;
    /**
     * Whenever will auto ack the message
     */
    autoAck?: boolean;
}

/**
 * Client-side broker for a simple RPC layout
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export interface RpcPublisher<S, C> extends Broker {
    /**
     * Event used mostly for internal errors
     * @event
     */
    on: ((event: "error", listener: (error: any) => any) => this) & ((event: `__${string}`, listener: (data: S, isError: false) => any | ((data: null, isError: true) => any)) => this);

    /** @internal */
    once: ((event: "error", listener: (error: any) => any) => this) & ((event: `__${string}`, listener: (data: S, isError: false) => any | ((data: null, isError: true) => any)) => this);

    /** @internal */
    emit: ((event: "error", error: any) => boolean) & ((event: `__${string}`, data: null, isError: true) => boolean) & ((event: `__${string}`, data: S, isError: false) => boolean);
}

/**
 * Client-side broker for a simple RPC layout
 */
export class RpcPublisher<S, C> extends Broker {
    /**
     * Queue used to send requests to the server
     */
    public serverQueue?: string;
    /**
     * Queue used to recieve responses from the server
     */
    public replyQueue?: string;
    /**
     * How long to wait before deeming the server un-responsive and dropping the request
     */
    public timeout?: number;

    public constructor(channel: Channel) {
        super(channel);
    }

    /**
     * Initializes the client, making it listen for reply packets
     * @param options Options used for this client
     */
    public async init(options: RpcPublisherInitOptions) {
        const { name, timeout = 1e4, autoAck = false } = options;

        this.serverQueue = await this.channel.assertQueue(name, { durable: false }).then(d => d.queue);
        this.replyQueue = await this.channel.assertQueue("", { exclusive: true }).then(d => d.queue);
        this.timeout = timeout;

        await this.util.consumeQueue({
            queue: this.replyQueue,
            cb: (decoded: { content: null; error: true } | { content: S; error: false }, msg) => {
                const key = `__${msg.properties.correlationId as string}` as const;
                if (msg.properties.correlationId) {
                    if (decoded.content) {
                        this.emit(key, decoded.content, false);
                    } else {
                        this.emit(key, null, true);
                    }
                }
            },
            autoAck
        });
    }

    /**
     * Sends a packet to the server
     * @param packet The packet to post
     * @returns The server's response
     */
    public post(packet: C) {
        return new Promise<S>((resolve, reject) => {
            if (!this.serverQueue) {
                return reject(new CordisBrokerError("brokerNotInit"));
            }

            const correlationId = this.util.generateCorrelationId();

            const cb = (res: S | null, isError: boolean) => {
                // eslint-disable-next-line @typescript-eslint/no-use-before-define
                clearTimeout(timeout);
                if (isError) {
                    return reject(new CordisBrokerError("serverFailure"));
                }

                return resolve(res as S);
            };

            const timeout = setTimeout(
                () => {
                    reject(new CordisBrokerError("noResponseInTime", this.timeout!));
                    this.off(`__${correlationId}`, cb);
                },
                this.timeout
            );

            this.once(`__${correlationId}` as const, cb);

            this.util.sendToQueue({
                to: this.serverQueue,
                content: packet,
                options: {
                    replyTo: this.replyQueue,
                    correlationId
                }
            });
        });
    }
}
