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
    name: string;
    /**
     * Wether or not this broker should be using a topic, direct, or fanout exchange
     */
    exchangeType?: "direct" | "fanout" | "topic";
    /**
     * Wether or not this broker should be durable
     */
    durable?: boolean;
}

/**
 * Server-side broker for routing packets using keys
 */
export class RoutingPublisher<K extends string, T extends Record<K, any>> extends Broker {
    /**
     * Exchange being used
     */
    public exchange?: string;

    public constructor(channel: Channel) {
        super(channel);
    }

    /**
     * Initializes the server
     * @param options Options used for this server
     */
    public async init(options: RoutingPublisherInitOptions) {
        this.exchange = await this.channel
            .assertExchange(options.name, options.exchangeType ??= "direct", { durable: options.durable })
            .then(d => d.exchange);
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
}
