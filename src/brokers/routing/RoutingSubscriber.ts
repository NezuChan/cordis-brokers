/* eslint-disable @typescript-eslint/no-unsafe-argument */
import { Broker } from "../Broker";
import { Channel } from "amqplib";

/**
 * Options for initializing the routing client
 */
export interface RoutingSubscriberInitOptions<K extends string> {
    /**
     * Name of the exchange to use
     */
    name: string;
    /**
     * Wether or not this broker should be using a topic, direct, or fanout exchange
     */
    exchangeType?: "direct" | "fanout" | "topic";
    /**
     * The routing keys you wish to subscribe to
     */
    keys: K | K[];
    /**
     * Queue to bind the packets to
     * @default queue Randomly generated queue by your AMQP server
     */
    queue?: string;
    /**
     * How old a message can be without being discarded
     * Use this so your workers don't play crazy catch-up with long-time downtime when they don't need to
     */
    maxMessageAge?: number;
    /**
     * Wether or not this broker should be durable
     */
    durable?: boolean;
    /**
     * Wether or not to use exchange binding
     */
    useExchangeBinding?: boolean;
}

export interface RoutingSubscriber<K extends string, T extends Record<K, any>> extends Broker {
    /**
     * Event used mostly for internal errors
     * @event
     */
    on: ((event: "error", listener: (error: any) => any) => this) & (<LK extends K>(event: LK, listener: (data: T[LK]) => any) => this);

    /** @internal */
    once: ((event: "error", listener: (error: any) => any) => this) & (<LK extends K>(event: LK, listener: (data: T[LK]) => any) => this);

    /** @internal */
    emit: ((event: "error", error: any) => boolean) & (<LK extends K>(event: LK, data: T[LK]) => boolean);
}

/**
 * Client-side broker for routing packets using keys
 */
export class RoutingSubscriber<K extends string, T extends Record<K, any>> extends Broker {
    public constructor(channel: Channel) {
        super(channel);
    }

    /**
     * Initializes the client, binding the events you want to the queue
     * @param options Options used for this client
     */
    public async init(options: RoutingSubscriberInitOptions<K>) {
        const { maxMessageAge = Infinity } = options;

        const queue = await this.getQueue(options);

        await this.util.consumeQueue({
            queue,
            cb: (content: { type?: any; t?: any; data: T[K] }, { properties: { timestamp } }) => {
                // For whatever reason amqplib types all properties as any ONLY when recieving?
                if ((timestamp as number) + maxMessageAge < Date.now()) {
                    return;
                }

                this.emit(content.t ?? content.type ?? content.data.t, content);
            },
            autoAck: true
        });
    }

    public async getQueue(options: RoutingSubscriberInitOptions<K>) {
        const { name, exchangeType = "direct", keys, queue: rawQueue = "", durable, useExchangeBinding } = options;
        if (useExchangeBinding) {
            const exchange = await this.channel.assertExchange(name, exchangeType, { durable }).then(d => d.exchange);
            const queue = await this.channel.assertQueue(rawQueue, { exclusive: rawQueue === "" }).then(data => data.queue);

            if (Array.isArray(keys)) {
                for (const key of keys) {
                    await this.channel.bindQueue(queue, exchange, key);
                }
            } else {
                await this.channel.bindQueue(queue, exchange, keys);
            }

            return queue;
        }

        const { queue } = await this.channel.assertQueue(rawQueue, { exclusive: rawQueue === "" });
        return queue;
    }
}
