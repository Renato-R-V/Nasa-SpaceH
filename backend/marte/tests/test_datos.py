"""Contrato anual y fallos cerrados del cargador, sin acceso a la red."""

from copy import deepcopy
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

from backend.marte.datos import REVISION_ANUAL, cargar_datos_backend


def fuentes_anuales():
    result = {}
    for planeta, proveedor, periodo in (
        ("tierra", "NASA POWER", "2001-2025"),
        ("marte", "MACDA v2.0", "MY25-MY34"),
    ):
        result[planeta] = {"fuentes_variables": {"ghi": {
            "tipo": "anual_5grados",
            "etiquetas": {
                "climatology_period": periodo,
                "source_resolution_degrees": "5",
                "source": proveedor,
                "quantity": "surface_downwelling_shortwave_flux_in_air",
                "normalized": "false", "albedo_applied": "false",
                "units": "W/m^2",
            },
        }}}
    return result


class CargaDatosBackendTests(unittest.TestCase):
    def test_carga_remota_fija_revision_y_devuelve_contrato_compartido(self):
        datos = fuentes_anuales()
        raiz = Path(__file__).resolve().parents[3]
        with patch("backend.marte.datos.compartidos.cargar_datos", return_value=datos) as cargar:
            resultado = cargar_datos_backend(raiz)
        cargar.assert_called_once_with(raiz.resolve(), revision=REVISION_ANUAL)
        self.assertEqual(REVISION_ANUAL, "1553312bc7c21520e8026483d6d40fd7af0efbe7")
        self.assertIs(resultado, datos)

    def test_rechaza_ghi_historico_en_cualquiera_de_los_planetas(self):
        for planeta in ("tierra", "marte"):
            with self.subTest(planeta=planeta):
                datos = fuentes_anuales()
                datos[planeta]["fuentes_variables"]["ghi"]["tipo"] = "historico"
                with patch("backend.marte.datos.compartidos.cargar_datos", return_value=datos):
                    with self.assertRaisesRegex(ValueError, planeta):
                        cargar_datos_backend(Path.cwd())

    def test_etiqueta_anual_no_permite_un_periodo_o_definicion_incorrectos(self):
        for clave, valor in (("climatology_period", "Ls=18.9"),
                             ("source_resolution_degrees", "1"),
                             ("albedo_applied", "true"),
                             ("units", "kWh/m²/day")):
            with self.subTest(clave=clave):
                datos = deepcopy(fuentes_anuales())
                datos["marte"]["fuentes_variables"]["ghi"]["etiquetas"][clave] = valor
                with patch("backend.marte.datos.compartidos.cargar_datos", return_value=datos):
                    with self.assertRaises(ValueError):
                        cargar_datos_backend(Path.cwd())

    def test_snapshot_incompleto_falla_sin_descarga_de_respaldo(self):
        with tempfile.TemporaryDirectory() as carpeta:
            with patch("backend.marte.datos.compartidos.cargar_datos") as remoto:
                with self.assertRaisesRegex(FileNotFoundError, "catalogo.json"):
                    cargar_datos_backend(Path.cwd(), Path(carpeta))
                remoto.assert_not_called()

    def test_catalogo_local_corrupto_del_mismo_tamano_falla_sin_red(self):
        with tempfile.TemporaryDirectory() as carpeta:
            destino = Path(carpeta) / "tierra"
            destino.mkdir()
            # El tamaño coincide con el catálogo publicado: solo el hash
            # distingue este archivo de una copia válida de la revisión.
            (destino / "catalogo.json").write_bytes(b" " * 31_360)
            with patch("backend.marte.datos.compartidos.cargar_datos") as remoto:
                with self.assertRaisesRegex(ValueError, "SHA256"):
                    cargar_datos_backend(Path.cwd(), Path(carpeta))
                remoto.assert_not_called()


if __name__ == "__main__":
    unittest.main()
