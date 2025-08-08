
# Documentación de Integración - API Alta de Envíos

## Endpoint

```
POST https://altaenvios.lightdata.com.ar/api/altaenvio
```



## Request: Body

```json
{
  "data": {
    "idEmpresa": 123,
    "ml_shipment_id": "1234567890", //opcional
    "ml_venta_id": "1234567890", //opcional,
    "didCliente": 99, 
    "flex" :1 //default 0
    "didCuenta": 3,
    "destination_receiver_email": "cliente@email.com", //opcional
    "destination_receiver_name": "Juan Pérez",
    "destination_receiver_phone": "1155550000", //opcional
    "fecha_venta": "2025-07-08",
    "peso": 1.5, //opcional
    "valor_declarado": 5000, //opcional
    "elim": 0, //opcional
    "enviosDireccionesDestino": {
      "calle": "Calle Falsa",
      "numero": "123",
      "cp": "1414",
      "ciudad": "CABA",
      "localidad": "floresta",
      "provincia": "Buenos Aires",
      "pais": "Argentina",
      "latitud": -34.6037, //opcional
      "longitud": -58.3816, //opcional
      "destination_comments": "Piso 3, Depto A", //opcional
      "delivery_preference": "" //opcional R o C
    },
    "envioscobranza": [{ "valor": 1500 }],
    "enviosLogisticaInversa": [{ "valor": 1 }],
    "enviosObservaciones": { "observaciones": "Cliente pide franja horaria 9-12" }
  }
}
```

## Ejemplo de Respuesta Exitosa

```json
{
  "estado": true,
  "message": "id Insertado",
  "qr": "Data del qr"
}
------
{
    "estado": true,
    "mensaje": 308,
    "qr": {
        "local": 1,
        "did": 999,
        "cliente": 1,
        "empresa": "999"
    }
}
```

## Posibles Errores

```json
{
  "estado": false,
  "message": "Faltan campos obligatorios: telefono, cp"
}
```


