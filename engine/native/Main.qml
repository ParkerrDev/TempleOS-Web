import QtQuick
import QtQuick.Controls
import QtQuick.Layouts
import HemuNative
ApplicationWindow {
  visible: true
  width: 800; height: 700; minimumWidth: 640; minimumHeight: 610
  title: qsTr("TempleOS — HEMU")
  color: "#111111"
  id: window
  property bool confirmedClose: false
  onClosing: event=>{if(backend.ready&&!confirmedClose){event.accepted=false;closeDialog.open()}}
  Dialog {
    id: closeDialog; anchors.centerIn: parent; modal: true
    title: qsTr("Close TempleOS?"); standardButtons: Dialog.Ok|Dialog.Cancel
    Label { text: qsTr("Changes since your last save will be lost.") }
    onAccepted: {window.confirmedClose=true;window.close()}
  }
  Dialog {
    id: replaceDialog; objectName: "replaceDialog"; anchors.centerIn: parent; modal: true
    property string nextPath
    title: qsTr("Replace the current session?"); standardButtons: Dialog.Ok|Dialog.Cancel
    Label { text: qsTr("Changes since your last save will be lost.") }
    onAccepted: backend.open(nextPath)
  }
  function openSession(nextPath) {
    if(backend.ready){replaceDialog.nextPath=nextPath;replaceDialog.open()}
    else backend.open(nextPath)
  }
  Connections {
    target: backend
    function onFileChosen(path,save) {if(save)backend.save(path);else window.openSession(path)}
  }
  ColumnLayout {
    anchors.fill: parent; spacing: 6
    Item {
      Layout.fillWidth: true; Layout.fillHeight: true
    HemuScreen {
      anchors.centerIn: parent; width: Math.min(parent.width,parent.height*4/3); height: width*3/4
      id: screen; objectName: "screen"; focus: true
      image: backend.image
      onActiveFocusChanged: if(!activeFocus)backend.release()
      MouseArea {
        anchors.fill: parent; hoverEnabled: true; acceptedButtons: Qt.LeftButton|Qt.RightButton
        property int wheelCount: 0
        function point(mouse) { backend.mouse(mouse.x/width*640,mouse.y/height*480,mouse.buttons,wheelCount) }
        onPressed: mouse=>{ screen.forceActiveFocus(); point(mouse); backend.capture() }
        onReleased: mouse=>point(mouse)
        onPositionChanged: mouse=>point(mouse)
        onCanceled: backend.release()
        onWheel: wheel=>{ wheelCount+=Math.sign(wheel.angleDelta.y); backend.mouse(wheel.x/width*640,wheel.y/height*480,wheel.buttons,wheelCount) }
      }
    }
    }
    RowLayout {
      Layout.fillWidth: true
      Label { Layout.fillWidth: true; text: backend.path||qsTr("Open a complete .hemu session"); textFormat: Text.PlainText; elide: Text.ElideMiddle; color: "white" }
      Button { objectName: "openFile"; text: qsTr("Open"); enabled: !backend.busy; onClicked: backend.choose(false) }
      Button { objectName: "saveFile"; text: qsTr("Save"); enabled: backend.ready&&!backend.busy; onClicked: backend.choose(true) }
    }
    RowLayout {
      Label { text: qsTr("Refresh limit"); color: "white" }
      ComboBox {
        objectName: "rate"; model: [qsTr("Uncapped"),"30","60","120"]
        currentIndex: [0,30,60,120].indexOf(backend.rate)
        enabled: backend.ready&&!backend.busy&&!backend.faulted
        onActivated: backend.settings([0,30,60,120][currentIndex],backend.repeat)
      }
      CheckBox {
        objectName: "repeat"; text: qsTr("BIOS key repeat"); checked: backend.repeat
        palette.windowText: "white"
        enabled: backend.ready&&!backend.busy&&!backend.faulted
        onToggled: backend.settings(backend.rate,checked)
      }
      Label { visible: backend.ready&&!backend.rateKnown; text: qsTr("Guest rate unavailable"); color: "white"; Layout.fillWidth: true }
    }
    RowLayout {
      Button { text: backend.paused?qsTr("Resume"):qsTr("Pause"); enabled: backend.ready&&!backend.busy&&!backend.faulted; onClicked: {backend.pause();screen.forceActiveFocus()} }
      Button { text: qsTr("Restart"); enabled: backend.ready&&!backend.busy; onClicked: window.openSession(backend.path) }
      Button { text: qsTr("Cancel"); enabled: backend.busy; onClicked: backend.cancel() }
      Label { text: backend.captured?qsTr("Pointer captured — Ctrl+Alt releases it"):backend.status; color: "white"; textFormat: Text.PlainText; wrapMode: Text.Wrap; Layout.fillWidth: true }
    }
  }
}
