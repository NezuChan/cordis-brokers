import { Connection, Channel, connect } from "amqplib";

/**
 * AMQP connection and channel
 */
export interface AmqpResult {
    connection: Connection;
    channel: Channel;
}

/**
 * Creates an AMQP connection and channel
 * @param host URL for your AMQP server
 * @returns
 */
export const createAmqp = async (host: string): Promise<AmqpResult> => {
    host = host.replace(/amqp?:?\/?\//g, "");

    const connection = await connect(`amqp://${host}`);

    return {
        connection,
        channel: await connection.createChannel()
    };
};
