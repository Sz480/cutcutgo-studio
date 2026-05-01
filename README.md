# inkscape-cutcutgo-sz

Fork of inkscape-cutcutgo for bring the development forward with vibe coding.

My setup:
* Cricut
  * Version: Maker-C98E (1. Generation)
  * PCB: ATH-84-112-X3
  * Firmware: CutcutGo 1.0 (Build: 972f570)
* Notebook
  * OS: Windows 11
  * Python: 3.11.9
  * Software: Inkscape 1.4.3
  * USB-Driver Installation: zadig 2.9

---

An extension to drive a Cricut Maker running the CutcutGo firmware from within inkscape,
largely derived from [inkscape-silhouette](https://github.com/fablabnbg/inkscape-silhouette)
developed by Juergen Weigert and contributors.

Here is the online documentation with photos: https://virtualabs.github.io/cutcutgo/


## Supported Devices

This extension should work with the following devices:

* Cricut Maker 1 (with CutcutGo firmware)

---

## Installation

### Windows

<!-- <details>
<summary>Click to get steps</summary> -->

1. Clone the repository.

2. Set up a venv:
    1. Generate the venv: `python -m venv .venv`
    2. Activate the venv: `.venv\Scripts\activate`
    3. Install libraries: pip install -r requirements.txt

3. Set the Python interpreter for Inkscape:
    1. Open Inkscape.
    2. Go to Edit -> Preferences -> System -> User preferences and copy the path (default: `%USERPROFILE%\AppData\Roaming\inkscape\preferences.xml`).
    3. Open the `preferences.xml` and search for `id="extensions"`.
    4. Add as the venv as attribut to this block `python-interpreter="...venv\Scripts\python.exe"`. Like 
        ```
        <group
        id="extensions"
        python-interpreter="...venv\Scripts\python.exe"
        org.inkscape.output.png.inkscape.png_bitdepth="99"
        ... />
        ```
    5. Save the file.

<!-- 4. Update the driver:
    1. Please connect to the Cricut via USB.
    2. Download and execute Zadig from http://zadig.akeo.ie/.
    3. Go to `Options` and select `List All Devices`.
    4. Select `Simple CDC Device Demo` from the dropdown.
    5. The `USB ID` should start with `04D8` (Graftek America).
    6. Select at `Driver` the `libusb-win32 (v1.4.0.0)` (default driver: `WinUSB`).
    7. Click on `Replace Driver`. -->

4. Check the driver:
    1. Please connect to the Cricut via USB.
    2. Go to the Device Manager and check if there is a connection to a serial USB device at a specific COM port.
    3. Test if the ports are seen by the python libraries: `.venv\Scripts\python.exe -c "import serial.tools.list_ports as lp; print([ (p.device,p.vid,p.pid,p.description) for p in lp.comports() ])"`
    4. The output should be like that: `[('COM5', 1240, 10, 'Serielles USB-Gerät (COM5)')]`
  * You can double-check for the right device by downloading and executing Zadig from http://zadig.akeo.ie/.
    * Go to `Options` and select `List All Devices`.
    * Select `Simple CDC Device Demo`.
    * The `USB ID` (e.g., [hex] 04D8 000A) must be the same as the output of the Python test script.
      * Output message must be converted to hex: `[...] 1240 = 0x04D8, 10 = 0x000A [...]`
     
Add extension to Inkscape:
* Download https://github.com/virtualabs/inkscape-cutcutgo/archive/main.zip
* Open the downloaded file and select the following three items: `cutcutgo`, `sendto_cricut.inx`, `sendto_cricut.py`
* Extract them to your `share\inkscape\extensions` directory, e.g. `C:\Program Files\Inkscape\share\inkscape\extensions`

Afterwards you can start Inkscape.
<!-- </details> -->

---

## Usage

### GUI

Refer to the [userguide instructions](./USERGUIDE.md) for further details.

### CLI

Run `sendto_cricut.py --help` for information on CLI usage.

---

## Troubleshooting

```python
>>> import usb.core
>>> usb.core.find()
<usb.core.Device object at 0xb720fb8c>
>>>
```

If this reports `no usb.core.Device` to you, please help troubleshoot.

```python
python
>>> import usb.core
>>> usb.version_info[0]
```

This fails on win32/64 with 'module has no attribute 'version info' which then causes Graphtec.py to error even though usb.core is installed.

## Features

* Path sorting for monotonic cut. We limit backwards movement to only a few
  millimeters, and make the knive pull only towards sharp corners
  so that most designs can be done without a cutting mat!
* Coordinate system conforms to inkscape SVG.
* Exact Margins. Can start at (0,0).
* Pen mode used to avoid the precut movement of the knive.
  Those movements are visible a) at the left hand side, when
  starting, b) at each sharp turn.
* Bounding Box. Can optionally plot (or calculate only)
  the bounding box instead of plotting all strokes.
  This can be used (with low pressure=1 or removed knive) to just
  check, where the plot would be.
* Robust communication with the device. Small writes and timeouts are
  handled gracefully. Timeouts will occur, when we travel far with low speed.
* Multipass: Can repeat each stroke multiple times to enhance plot or
  cut quality. This can also be used to attempt a cut without cutting mat, by
  applying very little pressure.
* reverse toggle options, to cut the opposite direction. This might also be
  helpful with mat-free cutting via multipass.
* honors hidden layers.

## Misfeatures of InkCut that we do not 'feature'

* object transforms are missing most of the time.
* Stars, polygons, and boxes are plotted not closed, the final stroke
  is missing. (Must be me, no?)
* always plots all layers, even if hidden.

## TODO

* Implement the triangle in a square test cut.

* Test MatFree cutting strategy with the WC-Wunderbach-Wimpern font, which is especially
  well suited as a test-case.

* Improve MatFree cutting by finding a better scan sort algorithm.
  Wide shadow casting towards negative y?

* Implement paper-zip as a separate inkscape extension.

## References

* https://inkscape.gitlab.io/extensions/documentation/authors/
* https://inkscape.gitlab.io/extensions/documentation/authors/inx-widgets.html
* https://wiki.inkscape.org/wiki/ExtensionsSystem
