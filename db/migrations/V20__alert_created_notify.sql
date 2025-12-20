-- V20: Add pg_notify trigger for alert creation events
-- This allows the API to listen for new alerts and forward them to NATS/Temporal

-- Function to notify when an alert is created
CREATE OR REPLACE FUNCTION notify_alert_created()
RETURNS TRIGGER AS $$
BEGIN
    -- Send notification with alert details as JSON payload
    PERFORM pg_notify('alert_created', json_build_object(
        'alert_id', NEW.id,
        'customer_id', NEW.customer_id,
        'scenario', NEW.scenario,
        'severity', NEW.severity,
        'type', NEW.type,
        'status', NEW.status,
        'created_at', NEW.created_at
    )::text);

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger on alerts table
DROP TRIGGER IF EXISTS trg_notify_alert_created ON alerts;
CREATE TRIGGER trg_notify_alert_created
    AFTER INSERT ON alerts
    FOR EACH ROW
    EXECUTE FUNCTION notify_alert_created();

COMMENT ON FUNCTION notify_alert_created() IS 'Publishes alert creation events via pg_notify for Temporal workflow orchestration';
