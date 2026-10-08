import importlib.util
import shutil
import tempfile
import unittest
from pathlib import Path


SPEC = importlib.util.spec_from_file_location("ocr_server", Path(__file__).with_name("server.py"))
SERVER = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(SERVER)


class OcrServiceTest(unittest.TestCase):
    def test_parses_text_and_average_confidence_from_tsv(self):
        tsv = "level\tpage_num\tblock_num\tpar_num\tline_num\tword_num\tleft\ttop\twidth\theight\tconf\ttext\n"
        tsv += "5\t1\t1\t1\t1\t1\t0\t0\t10\t10\t90\tEdital\n"
        tsv += "5\t1\t1\t1\t1\t2\t11\t0\t10\t10\t70\tdigitalizado\n"
        text, confidence = SERVER.parse_tesseract_tsv(tsv)
        self.assertEqual(text, "Edital digitalizado")
        self.assertEqual(confidence, 80)

    @unittest.skipUnless(shutil.which("tesseract"), "tesseract não está instalado no host; integração é validada pela imagem Docker")
    def test_invokes_local_tesseract_without_docker(self):
        with tempfile.TemporaryDirectory() as temporary:
            image = Path(temporary) / "blank.pgm"
            image.write_bytes(b"P5\n40 20\n255\n" + bytes([255]) * 800)
            text, confidence = SERVER.ocr_image(image, 10)
            self.assertIsInstance(text, str)
            self.assertGreaterEqual(confidence, 0)


if __name__ == "__main__":
    unittest.main()
