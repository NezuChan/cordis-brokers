import { Broker } from "../Broker";
import { CordisBrokerError } from "../../error";
import { Channel, Options } from "amqplib";

/**
 * Options for initializing the routing server
 */
export interface RoutingPublisherInitOptions {
    /**
     * Name of the exchange to use
     */
    name?: string;
    /**
     * Wether or not this broker should be using a topic, direct, or fanout exchange
     */
    exchangeType?: "direct" | "fanout" | "topic";
    /**
     * Wether or not this broker should be durable
     */
    durable?: boolean;
    /**
     * Name of queue to use
     */
    queue?: string;
    /**
     * Wether or not to use exchange binding
     */
    useExchangeBinding?: boolean;
}

/**
 * Server-side broker for routing packets using keys
 */
export class RoutingPublisher<K extends string, T extends Record<K, any>> extends Broker {
    /**
     * Exchange being used
     */
    public exchange?: string;

    /**
     * Queue being used
     */
    public queue?: string;

    public constructor(channel: Channel) {
        super(channel);
    }

    /**
     * Initializes the server
     * @param options Options used for this server
     */
    public async init(options: RoutingPublisherInitOptions) {
        if (options.useExchangeBinding && options.name) {
            this.exchange = await this.channel
                .assertExchange(options.name, options.exchangeType ??= "direct", { durable: options.durable })
                .then(d => d.exchange);
        }

        if (options.queue) {
            this.queue = await this.channel.assertQueue(options.queue, { durable: options.durable }).then(d => d.queue);
        }
    }

    /**
     * Publishes a message under the given key
     * @param key Event you're publishing
     * @param content Data to publish
     * @param options Message-specific options
     */
    public publish<LK extends K>(key: LK, content: T[LK], options: Options.Publish = {}) {
        if (!this.exchange) {
            throw new CordisBrokerError("brokerNotInit");
        }

        options.timestamp ??= Date.now();

        return this.util.sendToExchange({
            to: this.exchange,
            content: { type: key, data: content },
            key,
            options
        });
    }

    /**
     * Publishes a message under the given key
     * @param key Event you're publishing
     * @param content Data to publish
     * @param options Message-specific options
     */
    public publishAsQueue<LK extends K>(key: LK, content: T[LK], options: Options.Publish = {}) {
        if (!this.queue) {
            throw new CordisBrokerError("brokerNotInit");
        }

        options.timestamp ??= Date.now();

        return this.util.sendToQueue({
            to: this.queue,
            content: { type: key, data: content }
        });
    }
}
