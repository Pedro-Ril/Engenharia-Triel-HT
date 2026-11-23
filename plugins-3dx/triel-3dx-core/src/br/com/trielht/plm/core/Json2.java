package br.com.trielht.plm.core;

import jakarta.json.Json;
import jakarta.json.JsonObject;
import jakarta.json.JsonObjectBuilder;
import jakarta.json.JsonReader;
import jakarta.json.JsonString;
import jakarta.json.JsonValue;

import java.io.StringReader;

/** Atalhos de JSON (jakarta.json nao aceita null em add(String)). */
final class Json2 {

    private Json2() {
    }

    static void put(JsonObjectBuilder b, String name, String value) {
        if (value == null) b.add(name, JsonValue.NULL);
        else b.add(name, value);
    }

    static void put(JsonObjectBuilder b, String name, Integer value) {
        if (value == null) b.add(name, JsonValue.NULL);
        else b.add(name, value.intValue());
    }

    static String str(JsonObject o, String name) {
        JsonValue v = o.get(name);
        return v instanceof JsonString s ? s.getString() : null;
    }

    static Integer integer(JsonObject o, String name) {
        JsonValue v = o.get(name);
        return v instanceof jakarta.json.JsonNumber n ? n.intValue() : null;
    }

    static JsonObject parse(String json) {
        try (JsonReader r = Json.createReader(new StringReader(json))) {
            return r.readObject();
        }
    }
}
