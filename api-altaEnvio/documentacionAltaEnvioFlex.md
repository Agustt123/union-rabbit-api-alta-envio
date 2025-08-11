
# Documentación de Integración - API Alta de Envíos Flex

## Endpoint

```
POST https://altaenvios.lightdata.com.ar/api/altaEnvioFlex
```



## Request: Body

```json
{
  "data": {
    "idEmpresa": 123,
    "did": 99,
    "ml_shipment_id": "1234567890", 
    "ml_venta_id": "1234567890", 
    "didCliente": 99, 
    "flex" :1,  
    "ml_qr_seguridad" : {"id":545354353, "sender_id":22234554},
    "didCuenta": 3,
    "exterior" : 1,

   
  }
}
```

## Ejemplo de Respuesta Exitosa

```json
{
  "estado": true,
  "did": 345
}

```

## Posibles Errores

```json
{
  "estado": false,
  "message": "mensaje de error./p"
}
```


